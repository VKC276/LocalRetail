import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiUrl, mediaUrl, type Product, type Theme } from "../api";
import SalesReportPanel from "../components/SalesReport";
import { formatSek } from "../format";

type AdminProduct = Product & { active: boolean; featured: boolean; sort: number };
type Tab = "products" | "new-product" | "categories" | "report" | "settings" | "orders";
const OTHER_CATEGORY = "Övrigt";

function productEditKey(product: AdminProduct) {
  return JSON.stringify({
    name: product.name,
    price: product.price,
    category: product.category,
    active: product.active,
    featured: Boolean(product.featured),
  });
}

type Settings = {
  shopName: string;
  swishNumber: string;
  adminPin: string;
  theme: Theme;
  logoUrl?: string | null;
};

type Order = {
  id: string;
  createdAt: number;
  amount: number;
  message: string;
  voided?: boolean;
  voidedAt?: number | null;
  items: Array<{ name: string; qty: number; price: number }>;
};

export default function Admin() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [savedEdits, setSavedEdits] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({ shopName: "", swishNumber: "", adminPin: "", theme: "light" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "voided">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Alla");
  const [draft, setDraft] = useState({ name: "", price: "", category: "Dryck" });
  const [draftImage, setDraftImage] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const savedTimer = useRef<number>(0);
  const draftImageInput = useRef<HTMLInputElement>(null);

  const flashSaved = (key: string) => {
    window.clearTimeout(savedTimer.current);
    setSavedKey(key);
    savedTimer.current = window.setTimeout(() => setSavedKey(null), 2200);
  };

  const load = async () => {
    const [productRes, settingsRes, orderRes, categoryRes] = await Promise.all([
      api<{ products: AdminProduct[] }>("/api/admin/products"),
      api<Settings>("/api/admin/settings"),
      api<{ orders: Order[] }>("/api/admin/orders"),
      api<{ categories: string[] }>("/api/admin/categories"),
    ]);
    setProducts(productRes.products.map((product) => ({ ...product, imageUrl: mediaUrl(product.imageUrl) })));
    setSavedEdits(Object.fromEntries(productRes.products.map((p) => [p.id, productEditKey(p)])));
    setSettings({ ...settingsRes, logoUrl: mediaUrl(settingsRes.logoUrl) });
    setOrders(orderRes.orders);
    setCategories(categoryRes.categories);
    setCategoryEdits(Object.fromEntries(categoryRes.categories.map((name) => [name, name])));
    setDraft((current) =>
      categoryRes.categories.includes(current.category)
        ? current
        : { ...current, category: categoryRes.categories[0] ?? OTHER_CATEGORY },
    );
  };

  useEffect(() => {
    return () => {
      if (draftPreview) URL.revokeObjectURL(draftPreview);
    };
  }, [draftPreview]);

  const setDraftImageFile = (file: File | null) => {
    setDraftImage(file);
    setDraftPreview(file ? URL.createObjectURL(file) : null);
  };

  useEffect(() => {
    api<{ ok: boolean }>("/api/admin/session")
      .then(async (session) => {
        setAuthed(session.ok);
        if (session.ok) await load();
      })
      .finally(() => setReady(true));
  }, []);

  const visible = products.filter((p) => {
    const q = search.trim().toLowerCase();
    const catOk = categoryFilter === "Alla" || p.category === categoryFilter;
    const searchOk = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return catOk && searchOk;
  });

  const dirtyProducts = products.filter((p) => savedEdits[p.id] !== productEditKey(p));

  const saveAll = async () => {
    if (dirtyProducts.length === 0 || savingAll) return;
    setSavingAll(true);
    try {
      await Promise.all(
        dirtyProducts.map((product) =>
          api(`/api/admin/products/${product.id}`, {
            method: "PUT",
            body: JSON.stringify(product),
          }),
        ),
      );
      setSavedEdits((current) => {
        const next = { ...current };
        for (const product of dirtyProducts) next[product.id] = productEditKey(product);
        return next;
      });
      flashSaved("products");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Kunde inte spara produkterna");
    } finally {
      setSavingAll(false);
    }
  };

  const login = async () => {
    setLoginError(null);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ pin }) });
      setAuthed(true);
      setPin("");
      await load();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Fel pinkod");
    }
  };

  if (!ready) return null;
  if (!authed) {
    return (
      <div className="pin">
        <form
          className="pin-card"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <h1>Administration</h1>
          <p>Logga in med pinkod. Vid första start är koden 1234.</p>
          <label className="field">
            Pinkod
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          {loginError ? <p className="error">{loginError}</p> : null}
          <button type="submit" className="primary" disabled={pin.length < 4}>
            Logga in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <nav>
        <div className="brand brand-nav">
            <div className="brand-mark">{settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : null}</div>
          <div>
            <strong>{settings.shopName || "Kassa"}</strong>
            <h2>Admin</h2>
          </div>
        </div>
        <div className="nav-group">
          <button type="button" className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>
            Produkter
          </button>
          <button type="button" className={`nav-sub ${tab === "new-product" ? "on" : ""}`} onClick={() => setTab("new-product")}>
            Ny produkt
          </button>
          <button type="button" className={`nav-sub ${tab === "categories" ? "on" : ""}`} onClick={() => setTab("categories")}>
            Kategorier
          </button>
        </div>
        <div className="nav-group">
          <button type="button" className={tab === "report" ? "on" : ""} onClick={() => setTab("report")}>
            Rapport
          </button>
          <button type="button" className={`nav-sub ${tab === "orders" ? "on" : ""}`} onClick={() => setTab("orders")}>
            Köp
          </button>
        </div>
        <button type="button" className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>
          Inställningar
        </button>
        <Link to="/">Till kassan</Link>
        <button
          type="button"
          onClick={async () => {
            await api("/api/admin/logout", { method: "POST" });
            setAuthed(false);
          }}
        >
          Logga ut
        </button>
      </nav>
      <main className="admin-main">

        {tab === "products" ? (
          <>
            <h1>Produkter</h1>
            <p>Redigera sortimentet. Produkter utan bild visas med ljusgrå bakgrund i kassan.</p>
            <div className="admin-filters">
              <label className="field">
                Filter
                <input
                  value={search}
                  placeholder="Sök namn"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="field">
                Kategori
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="Alla">Alla</option>
                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="filter-count">
                {visible.length} av {products.length} produkter
              </p>
            </div>
            <div className="product-list">
              {visible.map((product) => (
                <article className="product-row" key={product.id}>
                  {product.imageUrl ? (
                    <img className="product-thumb" src={product.imageUrl} alt="" />
                  ) : (
                    <div className="product-thumb empty" aria-hidden="true" />
                  )}
                  <div className="product-fields">
                    <label className="field">
                      Namn
                      <input
                        value={product.name}
                        onChange={(e) =>
                          setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, name: e.target.value } : p)))
                        }
                      />
                    </label>
                    <label className="field">
                      Pris (kr)
                      <input
                        value={String(product.price)}
                        onChange={(e) =>
                          setProducts((list) =>
                            list.map((p) => (p.id === product.id ? { ...p, price: Number(e.target.value.replace(",", ".")) || 0 } : p)),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      Kategori
                      <select
                        value={product.category}
                        onChange={(e) =>
                          setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, category: e.target.value } : p)))
                        }
                      >
                        {categories.includes(product.category) ? null : (
                          <option value={product.category}>{product.category}</option>
                        )}
                        {categories.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="product-flags">
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={product.active}
                          onChange={(e) =>
                            setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, active: e.target.checked } : p)))
                          }
                        />
                        Synlig i kassan
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(product.featured)}
                          onChange={(e) =>
                            setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, featured: e.target.checked } : p)))
                          }
                        />
                        Lyft fram på förstasidan
                      </label>
                    </div>
                    <div className="product-row-actions">
                      <label className="ghost file-btn">
                        Byt bild
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const form = new FormData();
                            form.append("image", file);
                            await fetch(apiUrl(`/api/admin/products/${product.id}/image`), {
                              method: "POST",
                              body: form,
                              credentials: "include",
                            });
                            await load();
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost"
                        onClick={async () => {
                          const ok = window.confirm(`Ta bort “${product.name}”? Produkten försvinner från kassan och går inte att ångra.`);
                          if (!ok) return;
                          await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
                          await load();
                        }}
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="save-fab">
              <button
                type="button"
                className={`primary ${savedKey === "products" ? "saved" : ""}`}
                disabled={dirtyProducts.length === 0 || savingAll}
                onClick={() => void saveAll()}
              >
                {savingAll
                  ? "Sparar…"
                  : savedKey === "products"
                    ? "Sparad"
                    : dirtyProducts.length > 0
                      ? `Spara ${dirtyProducts.length} ${dirtyProducts.length === 1 ? "produkt" : "produkter"}`
                      : "Spara ändringar"}
              </button>
            </div>
          </>
        ) : null}

        {tab === "new-product" ? (
          <>
            <h1>Ny produkt</h1>
            <p>Lägg till en produkt i sortimentet.</p>
            <div className="admin-card" style={{ maxWidth: 520 }}>
              <label className="field">
                Namn
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="field">
                Pris (kr)
                <input value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} />
              </label>
              <label className="field">
                Kategori
                <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Bild
                <div className="draft-image">
                  {draftPreview ? <img className="product-thumb" src={draftPreview} alt="" /> : <div className="product-thumb empty" aria-hidden="true" />}
                  <div className="product-row-actions">
                    <label className="ghost file-btn">
                      Välj bild
                      <input
                        ref={draftImageInput}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => setDraftImageFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {draftImage ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setDraftImageFile(null);
                          if (draftImageInput.current) draftImageInput.current.value = "";
                        }}
                      >
                        Ta bort bild
                      </button>
                    ) : null}
                  </div>
                </div>
              </label>
              <button
                type="button"
                className={`primary ${savedKey === "new-product" ? "saved" : ""}`}
                onClick={async () => {
                  const created = await api<{ id: string }>("/api/admin/products", {
                    method: "POST",
                    body: JSON.stringify({
                      name: draft.name,
                      price: Number(draft.price.replace(",", ".")),
                      category: draft.category,
                    }),
                  });
                  if (draftImage) {
                    const form = new FormData();
                    form.append("image", draftImage);
                    await fetch(apiUrl(`/api/admin/products/${created.id}/image`), {
                      method: "POST",
                      body: form,
                      credentials: "include",
                    });
                  }
                  setDraft({ name: "", price: "", category: draft.category });
                  setDraftImageFile(null);
                  if (draftImageInput.current) draftImageInput.current.value = "";
                  flashSaved("new-product");
                  await load();
                }}
              >
                {savedKey === "new-product" ? "Tillagd" : "Lägg till"}
              </button>
            </div>
          </>
        ) : null}

        {tab === "categories" ? (
          <>
            <h1>Kategorier</h1>
            <p>Ändra vilka kategorier som visas i kassan. Tas en kategori bort hamnar produkterna under Övrigt.</p>
            <div className="admin-card" style={{ maxWidth: 640 }}>
              <label className="field">
                Ny kategori
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </label>
              {categoryError ? <p className="error">{categoryError}</p> : null}
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  setCategoryError(null);
                  try {
                    const res = await api<{ categories: string[] }>("/api/admin/categories", {
                      method: "POST",
                      body: JSON.stringify({ name: newCategory }),
                    });
                    setNewCategory("");
                    setCategories(res.categories);
                    setCategoryEdits(Object.fromEntries(res.categories.map((name) => [name, name])));
                  } catch (err) {
                    setCategoryError(err instanceof Error ? err.message : "Kunde inte lägga till kategori");
                  }
                }}
              >
                Lägg till kategori
              </button>
            </div>
            <div className="product-list" style={{ marginTop: 16, maxWidth: 640 }}>
              {categories.map((name) => {
                const locked = name === OTHER_CATEGORY;
                const edited = (categoryEdits[name] ?? name).trim();
                const count = products.filter((product) => product.category === name).length;
                return (
                  <article className="category-row" key={name}>
                    <label className="field">
                      Namn
                      <input
                        value={categoryEdits[name] ?? name}
                        disabled={locked}
                        onChange={(e) => setCategoryEdits((current) => ({ ...current, [name]: e.target.value }))}
                      />
                    </label>
                    <p className="filter-count">{count} produkter</p>
                    <div className="product-row-actions">
                      {locked ? (
                        <p className="filter-count">Övrigt kan inte tas bort eller byta namn.</p>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`ghost ${savedKey === `cat-${name}` ? "saved" : ""}`}
                            disabled={edited === name || !edited}
                            onClick={async () => {
                              setCategoryError(null);
                              try {
                                const res = await api<{ categories: string[] }>("/api/admin/categories", {
                                  method: "PUT",
                                  body: JSON.stringify({ from: name, to: edited }),
                                });
                                setCategories(res.categories);
                                setCategoryEdits(Object.fromEntries(res.categories.map((item) => [item, item])));
                                flashSaved(`cat-${name}`);
                                await load();
                              } catch (err) {
                                setCategoryError(err instanceof Error ? err.message : "Kunde inte spara kategori");
                              }
                            }}
                          >
                            {savedKey === `cat-${name}` ? "Sparad" : "Spara namn"}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={async () => {
                              const ok = window.confirm(
                                `Ta bort kategorin “${name}”? Produkter med vald kategori kommer hamna under ”Övrigt”.`,
                              );
                              if (!ok) return;
                              setCategoryError(null);
                              try {
                                await api(`/api/admin/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
                                await load();
                              } catch (err) {
                                setCategoryError(err instanceof Error ? err.message : "Kunde inte ta bort kategori");
                              }
                            }}
                          >
                            Ta bort
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}

        {tab === "report" ? <SalesReportPanel /> : null}

        {tab === "settings" ? (
          <>
            <h1>Inställningar</h1>
            <div className="admin-card" style={{ maxWidth: 520 }}>
              <label className="field">
                Logotyp
                <div className="logo-field">
                  <div className={`logo-preview ${settings.logoUrl ? "" : "empty"}`}>
                    {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : <span>Ingen logotyp</span>}
                  </div>
                  <div className="product-row-actions">
                    <label className="ghost file-btn">
                      Välj logotyp
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          const form = new FormData();
                          form.append("image", file);
                          const res = await fetch(apiUrl("/api/admin/settings/logo"), {
                            method: "POST",
                            body: form,
                            credentials: "include",
                          });
                          const data = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
                          if (!res.ok) {
                            window.alert(data.error || "Kunde inte spara logotypen");
                            return;
                          }
                          setSettings((current) => ({ ...current, logoUrl: data.logoUrl ?? null }));
                          flashSaved("logo");
                        }}
                      />
                    </label>
                    {settings.logoUrl ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={async () => {
                          await api("/api/admin/settings/logo", { method: "DELETE" });
                          setSettings((current) => ({ ...current, logoUrl: null }));
                        }}
                      >
                        Ta bort logotyp
                      </button>
                    ) : null}
                  </div>
                </div>
              </label>
              <label className="field">
                Butiksnamn
                <input value={settings.shopName} onChange={(e) => setSettings((s) => ({ ...s, shopName: e.target.value }))} />
              </label>
              <label className="field">
                Swish-nummer
                <input value={settings.swishNumber} onChange={(e) => setSettings((s) => ({ ...s, swishNumber: e.target.value }))} />
              </label>
              <label className="field">
                Tema för kassan
                <div className="theme-picks">
                  {(
                    [
                      { id: "light", name: "Ljust", hint: "Ljusa kort mot mjuk bakgrund" },
                      { id: "dark", name: "Mörkt", hint: "Kolsvart yta med grön kontrast" },
                      { id: "bold", name: "Grafit", hint: "Nattblå grafit med blå accent" },
                      { id: "contrast", name: "Kontrast", hint: "Mörk bakgrund, ljusa kort" },
                    ] as const
                  ).map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`theme-pick theme-pick-${theme.id} ${settings.theme === theme.id ? "on" : ""}`}
                      onClick={() => setSettings((s) => ({ ...s, theme: theme.id }))}
                    >
                      <span className="theme-swatch" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <strong>{theme.name}</strong>
                      <span>{theme.hint}</span>
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                Admin-pinkod
                <input type="password" value={settings.adminPin} onChange={(e) => setSettings((s) => ({ ...s, adminPin: e.target.value }))} />
              </label>
              <button
                type="button"
                className={`primary ${savedKey === "settings" ? "saved" : ""}`}
                onClick={async () => {
                  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
                  flashSaved("settings");
                }}
              >
                {savedKey === "settings" ? "Sparad" : "Spara"}
              </button>
            </div>
          </>
        ) : null}

        {tab === "orders" ? (
          <>
            <h1>Genomförda köp</h1>
            <p>
              Swish skickar ingen bekräftelse hit. Ta bort köp som inte betalades, gjordes av misstag eller ångrades — de
              räknas då inte i försäljningsrapporten.
            </p>
            <div className="admin-filters">
              <label className="field">
                Visa
                <select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value as typeof orderFilter)}>
                  <option value="active">I rapporten</option>
                  <option value="voided">Borttagna från rapporten</option>
                  <option value="all">Alla</option>
                </select>
              </label>
              <p className="filter-count">
                {orders.filter((order) => {
                  if (orderFilter === "active") return !order.voided;
                  if (orderFilter === "voided") return order.voided;
                  return true;
                }).length}{" "}
                köp
              </p>
            </div>
            <div className="product-list">
              {orders
                .filter((order) => {
                  if (orderFilter === "active") return !order.voided;
                  if (orderFilter === "voided") return order.voided;
                  return true;
                })
                .map((order) => (
                  <article className={`order-row ${order.voided ? "voided" : ""}`} key={order.id}>
                    <div>
                      <strong>
                        {order.id} · {formatSek(order.amount)}
                      </strong>
                      <p>{new Date(order.createdAt).toLocaleString("sv-SE")}</p>
                      <p>{order.message}</p>
                      {order.items.map((item) => (
                        <div key={item.name}>
                          {item.qty} × {item.name}
                        </div>
                      ))}
                      {order.voided ? (
                        <p className="warn">Borttaget från rapporten{order.voidedAt ? ` ${new Date(order.voidedAt).toLocaleString("sv-SE")}` : ""}.</p>
                      ) : null}
                    </div>
                    {order.voided ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={async () => {
                          await api(`/api/admin/orders/${order.id}/restore`, { method: "POST" });
                          await load();
                        }}
                      >
                        Återställ
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={async () => {
                          const ok = window.confirm(
                            `Ta bort köp ${order.id} (${formatSek(order.amount)}) från rapporten? Det räknas inte som försäljning. Du kan återställa det senare.`,
                          );
                          if (!ok) return;
                          await api(`/api/admin/orders/${order.id}/void`, { method: "POST" });
                          await load();
                        }}
                      >
                        Ta bort från rapport
                      </button>
                    )}
                  </article>
                ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
