type OrderLine = {
  id?: string;
  name: string;
  price: number;
  qty: number;
  category?: string;
};

export type ReportProduct = {
  id: string;
  name: string;
  category: string;
  qty: number;
  amount: number;
};

export type ReportCategory = {
  category: string;
  qty: number;
  amount: number;
  products: ReportProduct[];
};

export type SalesReport = {
  from: string;
  to: string;
  orderCount: number;
  itemCount: number;
  totalAmount: number;
  categories: ReportCategory[];
  products: ReportProduct[];
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function tzOffsetMs(timeZone: string, utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

export function stockholmStartMs(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  return guess - tzOffsetMs("Europe/Stockholm", guess);
}

export function stockholmEndMs(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  return guess - tzOffsetMs("Europe/Stockholm", guess);
}

export function parseYmd(value: string | null | undefined) {
  if (!value || !YMD.test(value)) return null;
  return value;
}

export function parseLines(json: string): OrderLine[] {
  try {
    const parsed = JSON.parse(json) as OrderLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildReport(
  from: string,
  to: string,
  orders: Array<{ amount: number; items_json: string }>,
  productMeta: Map<string, { name: string; category: string }>,
): SalesReport {
  const products = new Map<string, ReportProduct>();
  let itemCount = 0;
  let totalAmount = 0;

  for (const order of orders) {
    totalAmount += Number(order.amount) || 0;
    for (const line of parseLines(order.items_json)) {
      const qty = Number(line.qty) || 0;
      if (qty <= 0) continue;
      const meta = line.id ? productMeta.get(line.id) : undefined;
      const name = line.name || meta?.name || "Okänd produkt";
      const category = line.category || meta?.category || "Övrigt";
      const id = line.id || `${category}:${name}`;
      const amount = Math.round((Number(line.price) || 0) * qty * 100) / 100;
      const current = products.get(id) ?? { id, name, category, qty: 0, amount: 0 };
      current.qty += qty;
      current.amount = Math.round((current.amount + amount) * 100) / 100;
      products.set(id, current);
      itemCount += qty;
    }
  }

  const productList = [...products.values()].sort(
    (a, b) => a.category.localeCompare(b.category, "sv") || b.qty - a.qty || a.name.localeCompare(b.name, "sv"),
  );
  const categoryMap = new Map<string, ReportCategory>();
  for (const product of productList) {
    const current = categoryMap.get(product.category) ?? {
      category: product.category,
      qty: 0,
      amount: 0,
      products: [],
    };
    current.qty += product.qty;
    current.amount = Math.round((current.amount + product.amount) * 100) / 100;
    current.products.push(product);
    categoryMap.set(product.category, current);
  }

  return {
    from,
    to,
    orderCount: orders.length,
    itemCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    categories: [...categoryMap.values()].sort((a, b) => a.category.localeCompare(b.category, "sv")),
    products: productList,
  };
}

export function reportToCsv(report: SalesReport) {
  const rows = [["Kategori", "Produkt", "Antal", "Summa kr"]];
  for (const category of report.categories) {
    for (const product of category.products) {
      rows.push([category.category, product.name, String(product.qty), product.amount.toFixed(2).replace(".", ",")]);
    }
    rows.push([category.category, "Summa kategori", String(category.qty), category.amount.toFixed(2).replace(".", ",")]);
  }
  rows.push(["Totalt", `${report.orderCount} köp`, String(report.itemCount), report.totalAmount.toFixed(2).replace(".", ",")]);
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n")}\r\n`;
}
