import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import seedProducts from "../seed/products.json";
import { swishQrDataUrl } from "./swishQr";
import { buildReport, parseYmd, reportToCsv, stockholmEndMs, stockholmStartMs } from "./report";
import { reportToPdf } from "./reportPdf";
import { normalizeIcon } from "./icons";

type SeedProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  sort: number;
  active: number;
};

const seeds = seedProducts as SeedProduct[];

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
};

type Variables = {
  admin: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
  category: string;
  sort: number;
  active: number;
  image_key: string | null;
  icon: string | null;
  featured: number;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api");

let bootstrapped = false;

async function bootstrap(env: Bindings) {
  if (bootstrapped) return;
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        image_key TEXT,
        icon TEXT,
        featured INTEGER NOT NULL DEFAULT 0
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        amount REAL NOT NULL,
        message TEXT NOT NULL,
        items_json TEXT NOT NULL
      )
    `),
  ]);

    await env.DB.prepare(
      "DELETE FROM products WHERE category IN ('Kurser', 'Medlemskap')",
    ).run();

  const columns = await env.DB.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  const names = new Set(columns.results.map((col) => col.name));
  if (!names.has("icon")) {
    await env.DB.prepare("ALTER TABLE products ADD COLUMN icon TEXT").run();
  }
  if (!names.has("featured")) {
    await env.DB.prepare("ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0").run();
  }

  const orderColumns = await env.DB.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const orderNames = new Set(orderColumns.results.map((col) => col.name));
  if (!orderNames.has("voided")) {
    await env.DB.prepare("ALTER TABLE orders ADD COLUMN voided INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!orderNames.has("voided_at")) {
    await env.DB.prepare("ALTER TABLE orders ADD COLUMN voided_at INTEGER").run();
  }

    const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM products").first<{ c: number }>();
  if (!existing || existing.c === 0) {
    const stmt = env.DB.prepare(
      "INSERT OR IGNORE INTO products (id, name, price, category, sort, active) VALUES (?, ?, ?, ?, ?, 1)",
    );
    await env.DB.batch(
      seeds.map((p) => stmt.bind(p.id, p.name, p.price, p.category, p.sort)),
    );
  }

  const defaults: Array<[string, string]> = [
    ["shop_name", "Klätterhallen"],
    ["swish_number", ""],
    ["admin_pin", "1234"],
    ["theme", "light"],
    ["categories", JSON.stringify(DEFAULT_CATEGORIES)],
  ];
  for (const [key, value] of defaults) {
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
  }

  const stored = await getCategories(env);
  const distinct = await env.DB.prepare("SELECT DISTINCT category AS name FROM products").all<{ name: string }>();
  const merged = [...stored];
  for (const row of distinct.results) {
    const name = normalizeCategoryName(row.name || "");
    if (name && !merged.some((item) => item.toLowerCase() === name.toLowerCase())) merged.push(name);
  }
  await saveCategories(env, merged);

  bootstrapped = true;
}

const OTHER_CATEGORY = "Övrigt";
const DEFAULT_CATEGORIES = ["Entre", "Hyra", "Dryck", "Snacks", "Utrustning", OTHER_CATEGORY];

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function parseCategoryList(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      const name = normalizeCategoryName(String(item ?? ""));
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  } catch {
    return [] as string[];
  }
}

function withOtherCategory(list: string[]) {
  if (list.some((name) => name.toLowerCase() === OTHER_CATEGORY.toLowerCase())) return list;
  return [...list, OTHER_CATEGORY];
}

function insertCategory(list: string[], name: string) {
  const next = list.filter((item) => item.toLowerCase() !== OTHER_CATEGORY.toLowerCase());
  next.push(name);
  return withOtherCategory(next);
}

function isOtherCategory(name: string) {
  return name.toLowerCase() === OTHER_CATEGORY.toLowerCase();
}

async function saveCategories(env: Bindings, categories: string[]) {
  const list = withOtherCategory(parseCategoryList(JSON.stringify(categories)));
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('categories', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(JSON.stringify(list))
    .run();
  return list;
}

async function getCategories(env: Bindings) {
  const raw = await getSetting(env, "categories");
  const list = parseCategoryList(raw);
  return withOtherCategory(list.length ? list : [...DEFAULT_CATEGORIES]);
}

async function getSetting(env: Bindings, key: string) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? "";
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function slugify(category: string, name: string) {
  const base = `${category}-${name}`
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeTheme(value: string) {
  if (value === "dark" || value === "bold" || value === "contrast") return value;
  return "light";
}

function normalizeSwish(value: string) {
  return value.replace(/\s+/g, "");
}

app.use("*", async (c, next) => {
  await bootstrap(c.env);
  await next();
});

app.get("/catalog", async (c) => {
  const products = await c.env.DB.prepare(
    "SELECT id, name, price, category, sort, image_key, icon, featured FROM products WHERE active = 1 ORDER BY featured DESC, category, sort, name",
  ).all<ProductRow>();
  const shopName = await getSetting(c.env, "shop_name");
  const swishNumber = await getSetting(c.env, "swish_number");
  const logoKey = await getSetting(c.env, "logo_key");
  const theme = normalizeTheme(await getSetting(c.env, "theme"));
  const categories = await getCategories(c.env);
  return c.json({
    shopName,
    theme,
    logoUrl: logoKey ? `/api/logo?t=${encodeURIComponent(logoKey)}` : null,
    swishConfigured: Boolean(normalizeSwish(swishNumber)),
    categories,
    products: products.results.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      icon: p.icon,
      featured: Boolean(p.featured),
      imageUrl: p.image_key ? `/api/images/${p.id}` : null,
    })),
  });
});

app.get("/images/:id", async (c) => {
  const id = c.req.param("id");
  const product = await c.env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(id).first<ProductRow>();
  if (!product?.image_key) return c.notFound();
  const object = await c.env.IMAGES.get(product.image_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=3600");
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.get("/logo", async (c) => {
  const key = await getSetting(c.env, "logo_key");
  if (!key) return c.notFound();
  const object = await c.env.IMAGES.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=3600");
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.post("/checkout", async (c) => {
  const body = await c.req.json<{ items: Array<{ id: string; qty: number }> }>();
  const items = (body.items ?? []).filter((item) => item.qty > 0);
  if (items.length === 0) return jsonError("Varukorgen är tom");

  const payee = normalizeSwish(await getSetting(c.env, "swish_number"));
  if (!payee) return jsonError("Swish-nummer saknas. Ange det under Administration.", 409);

  const lines: Array<{ id: string; name: string; price: number; qty: number; category: string }> = [];
  let amount = 0;
  for (const item of items) {
    const product = await c.env.DB.prepare(
      "SELECT id, name, price, category FROM products WHERE id = ? AND active = 1",
    )
      .bind(item.id)
      .first<ProductRow>();
    if (!product) return jsonError(`Produkten finns inte: ${item.id}`);
    const qty = Math.min(99, Math.floor(item.qty));
    amount += product.price * qty;
    lines.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty,
      category: product.category,
    });
  }

  amount = Math.round(amount * 100) / 100;
  if (amount < 1) return jsonError("Beloppet måste vara minst 1 kr");

  const orderId = crypto.randomUUID().slice(0, 8).toUpperCase();
  const message = `Kassa ${orderId}`;
  const qrDataUrl = swishQrDataUrl(payee, amount, message);

  await c.env.DB.prepare(
    "INSERT INTO orders (id, created_at, amount, message, items_json) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(orderId, Date.now(), amount, message, JSON.stringify(lines))
    .run();

  return c.json({
    orderId,
    amount,
    message,
    qrDataUrl,
    items: lines,
  });
});

async function requireAdmin(c: { env: Bindings; req: { raw: Request } }) {
  const token = getCookie(c as never, "admin_session");
  if (!token) return false;
  const session = await c.env.DB.prepare(
    "SELECT id FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(token, Date.now())
    .first();
  return Boolean(session);
}

app.post("/admin/login", async (c) => {
  const { pin } = await c.req.json<{ pin: string }>();
  const expected = await getSetting(c.env, "admin_pin");
  if (!pin || pin !== expected) return jsonError("Fel pinkod", 401);
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(id, now, now + 12 * 60 * 60 * 1000)
    .run();
  setCookie(c, "admin_session", id, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 12 * 60 * 60,
  });
  return c.json({ ok: true });
});

app.post("/admin/logout", async (c) => {
  const token = getCookie(c, "admin_session");
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }
  deleteCookie(c, "admin_session", { path: "/" });
  return c.json({ ok: true });
});

app.get("/admin/session", async (c) => {
  return c.json({ ok: await requireAdmin(c) });
});

app.use("/admin/*", async (c, next) => {
  if (c.req.path === "/api/admin/login" || c.req.path === "/api/admin/session") {
    await next();
    return;
  }
  if (!(await requireAdmin(c))) return jsonError("Inte inloggad", 401);
  await next();
});

app.get("/admin/categories", async (c) => {
  return c.json({ categories: await getCategories(c.env) });
});

app.post("/admin/categories", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const name = normalizeCategoryName(body.name ?? "");
  if (!name) return jsonError("Kategorinamn krävs");
  const current = await getCategories(c.env);
  if (current.some((item) => item.toLowerCase() === name.toLowerCase())) {
    return jsonError("Kategorin finns redan");
  }
  const categories = await saveCategories(c.env, insertCategory(current, name));
  return c.json({ categories });
});

app.put("/admin/categories", async (c) => {
  const body = await c.req.json<{ from: string; to: string }>();
  const from = normalizeCategoryName(body.from ?? "");
  const to = normalizeCategoryName(body.to ?? "");
  if (!from || !to) return jsonError("Kategorinamn krävs");
  if (isOtherCategory(from)) return jsonError("Kategorin Övrigt kan inte byta namn");
  const current = await getCategories(c.env);
  if (!current.some((item) => item.toLowerCase() === from.toLowerCase())) {
    return jsonError("Kategorin hittades inte", 404);
  }
  if (current.some((item) => item.toLowerCase() === to.toLowerCase() && item.toLowerCase() !== from.toLowerCase())) {
    return jsonError("Kategorin finns redan");
  }
  const next = current.map((item) => (item.toLowerCase() === from.toLowerCase() ? to : item));
  await c.env.DB.prepare("UPDATE products SET category = ? WHERE category = ?").bind(to, from).run();
  const categories = await saveCategories(c.env, next);
  return c.json({ categories });
});

app.delete("/admin/categories", async (c) => {
  const name = normalizeCategoryName(c.req.query("name") ?? "");
  if (!name) return jsonError("Kategorinamn krävs");
  if (isOtherCategory(name)) return jsonError("Kategorin Övrigt kan inte tas bort");
  const current = await getCategories(c.env);
  if (!current.some((item) => item.toLowerCase() === name.toLowerCase())) {
    return jsonError("Kategorin hittades inte", 404);
  }
  await c.env.DB.prepare("UPDATE products SET category = ? WHERE category = ?").bind(OTHER_CATEGORY, name).run();
  const categories = await saveCategories(
    c.env,
    current.filter((item) => item.toLowerCase() !== name.toLowerCase()),
  );
  return c.json({ categories });
});

app.get("/admin/products", async (c) => {
  const products = await c.env.DB.prepare(
    "SELECT id, name, price, category, sort, active, image_key, icon, featured FROM products ORDER BY featured DESC, category, sort, name",
  ).all<ProductRow>();
  return c.json({
    products: products.results.map((p) => ({
      ...p,
      active: Boolean(p.active),
      featured: Boolean(p.featured),
      imageUrl: p.image_key ? `/api/images/${p.id}?t=${p.image_key}` : null,
    })),
  });
});

app.post("/admin/products", async (c) => {
  const body = await c.req.json<{
    name: string;
    price: number;
    category: string;
    active?: boolean;
    featured?: boolean;
    icon?: string | null;
  }>();
  const name = body.name?.trim();
  const category = body.category?.trim() || "Övrigt";
  const price = Number(body.price);
  const icon = normalizeIcon(body.icon);
  if (!name) return jsonError("Namn krävs");
  if (!Number.isFinite(price) || price < 0) return jsonError("Ogiltigt pris");
  const maxSort = await c.env.DB.prepare("SELECT MAX(sort) AS s FROM products").first<{ s: number | null }>();
  const id = slugify(category, name);
  await c.env.DB.prepare(
    "INSERT INTO products (id, name, price, category, sort, active, icon, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, name, price, category, (maxSort?.s ?? 0) + 1, body.active === false ? 0 : 1, icon, body.featured ? 1 : 0)
    .run();
  return c.json({ id });
});

app.put("/admin/products/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name: string;
    price: number;
    category: string;
    active: boolean;
    featured?: boolean;
    sort?: number;
    icon?: string | null;
  }>();
  const name = body.name?.trim();
  const category = body.category?.trim();
  const price = Number(body.price);
  const icon = normalizeIcon(body.icon);
  if (!name || !category) return jsonError("Namn och kategori krävs");
  if (!Number.isFinite(price) || price < 0) return jsonError("Ogiltigt pris");
  const result = await c.env.DB.prepare(
    "UPDATE products SET name = ?, price = ?, category = ?, active = ?, featured = ?, sort = COALESCE(?, sort), icon = ? WHERE id = ?",
  )
    .bind(name, price, category, body.active ? 1 : 0, body.featured ? 1 : 0, body.sort ?? null, icon, id)
    .run();
  if (!result.meta.changes) return jsonError("Produkten hittades inte", 404);
  return c.json({ ok: true });
});

app.delete("/admin/products/:id", async (c) => {
  const id = c.req.param("id");
  const product = await c.env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(id).first<ProductRow>();
  if (product?.image_key) await c.env.IMAGES.delete(product.image_key);
  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.post("/admin/products/:id/image", async (c) => {
  const id = c.req.param("id");
  const product = await c.env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
  if (!product) return jsonError("Produkten hittades inte", 404);
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return jsonError("Ingen bild vald");
  if (file.size > 4 * 1024 * 1024) return jsonError("Bilden får vara max 4 MB");
  const key = `product-${id}-${Date.now()}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });
  const old = await c.env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(id).first<ProductRow>();
  await c.env.DB.prepare("UPDATE products SET image_key = ? WHERE id = ?").bind(key, id).run();
  if (old?.image_key) await c.env.IMAGES.delete(old.image_key);
  return c.json({ imageUrl: `/api/images/${id}?t=${key}` });
});

app.delete("/admin/products/:id/image", async (c) => {
  const id = c.req.param("id");
  const product = await c.env.DB.prepare("SELECT image_key FROM products WHERE id = ?").bind(id).first<ProductRow>();
  if (product?.image_key) await c.env.IMAGES.delete(product.image_key);
  await c.env.DB.prepare("UPDATE products SET image_key = NULL WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/admin/settings", async (c) => {
  const rows = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  return c.json({
    shopName: map.shop_name ?? "",
    swishNumber: map.swish_number ?? "",
    adminPin: map.admin_pin ?? "",
    theme: normalizeTheme(map.theme ?? "light"),
    logoUrl: map.logo_key ? `/api/logo?t=${encodeURIComponent(map.logo_key)}` : null,
  });
});

app.put("/admin/settings", async (c) => {
  const body = await c.req.json<{ shopName: string; swishNumber: string; adminPin: string; theme?: string }>();
  const shopName = body.shopName?.trim();
  const swishNumber = normalizeSwish(body.swishNumber ?? "");
  const adminPin = String(body.adminPin ?? "").trim();
  const theme = normalizeTheme(body.theme ?? "light");
  if (!shopName) return jsonError("Butiksnamn krävs");
  if (adminPin.length < 4) return jsonError("Pinkoden ska vara minst 4 siffror");
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('shop_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(shopName),
    c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('swish_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(swishNumber),
    c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('admin_pin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(adminPin),
    c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(theme),
  ]);
  return c.json({ ok: true });
});

app.post("/admin/settings/logo", async (c) => {
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return jsonError("Ingen bild vald");
  if (file.size > 4 * 1024 * 1024) return jsonError("Bilden får vara max 4 MB");
  const key = `logo-${Date.now()}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });
  const old = await getSetting(c.env, "logo_key");
  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('logo_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key)
    .run();
  if (old) await c.env.IMAGES.delete(old);
  return c.json({ logoUrl: `/api/logo?t=${encodeURIComponent(key)}` });
});

app.delete("/admin/settings/logo", async (c) => {
  const old = await getSetting(c.env, "logo_key");
  if (old) await c.env.IMAGES.delete(old);
  await c.env.DB.prepare("DELETE FROM settings WHERE key = 'logo_key'").run();
  return c.json({ ok: true });
});

app.get("/admin/orders", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, created_at, amount, message, items_json, IFNULL(voided, 0) AS voided, voided_at FROM orders ORDER BY created_at DESC LIMIT 200",
  ).all<{
    id: string;
    created_at: number;
    amount: number;
    message: string;
    items_json: string;
    voided: number;
    voided_at: number | null;
  }>();
  return c.json({
    orders: rows.results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      amount: row.amount,
      message: row.message,
      voided: Boolean(row.voided),
      voidedAt: row.voided_at,
      items: JSON.parse(row.items_json) as unknown,
    })),
  });
});

app.post("/admin/orders/:id/void", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("UPDATE orders SET voided = 1, voided_at = ? WHERE id = ? AND IFNULL(voided, 0) = 0")
    .bind(Date.now(), id)
    .run();
  if (!result.meta.changes) return jsonError("Köpet hittades inte eller är redan borttaget från rapporten", 404);
  return c.json({ ok: true });
});

app.post("/admin/orders/:id/restore", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("UPDATE orders SET voided = 0, voided_at = NULL WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) return jsonError("Köpet hittades inte", 404);
  return c.json({ ok: true });
});

app.get("/admin/report", async (c) => {
  const from = parseYmd(c.req.query("from"));
  const to = parseYmd(c.req.query("to"));
  if (!from || !to) return jsonError("Ange from och to som YYYY-MM-DD");
  if (from > to) return jsonError("Från-datum måste vara före till-datum");

  const rows = await c.env.DB.prepare(
    "SELECT amount, items_json FROM orders WHERE created_at >= ? AND created_at <= ? AND IFNULL(voided, 0) = 0 ORDER BY created_at",
  )
    .bind(stockholmStartMs(from), stockholmEndMs(to))
    .all<{ amount: number; items_json: string }>();

  const products = await c.env.DB.prepare("SELECT id, name, category FROM products").all<{
    id: string;
    name: string;
    category: string;
  }>();
  const meta = new Map(products.results.map((p) => [p.id, { name: p.name, category: p.category }]));
  const report = buildReport(from, to, rows.results, meta);
  const shopName = await getSetting(c.env, "shop_name");

  if (c.req.query("format") === "csv") {
    return new Response(reportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="forsaljning-${from}-${to}.csv"`,
      },
    });
  }

  if (c.req.query("format") === "pdf") {
    const bytes = await reportToPdf(report, shopName);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="forsaljning-${from}-${to}.pdf"`,
      },
    });
  }

  return c.json(report);
});

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
