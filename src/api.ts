export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  icon?: string | null;
  featured?: boolean;
  imageUrl: string | null;
  imageHash?: string;
  imageKey?: string;
  active?: boolean;
  sort?: number;
};

export type CartItem = Product & { qty: number };

export type Theme = "light" | "dark" | "bold" | "contrast";

export type EntryPage = {
  title: string;
  body: string;
  url: string;
  logoUrl?: string | null;
};

export type HomeSlot = "member" | "epassi" | "swish";

export type Catalog = {
  revision?: number;
  shopName: string;
  theme?: Theme;
  logoUrl?: string | null;
  logoHash?: string | null;
  swishNumber?: string;
  swishConfigured: boolean;
  homeOrder?: HomeSlot[];
  memberPage?: EntryPage;
  epassiPage?: EntryPage;
  categories: string[];
  products: Product[];
};

export type CheckoutResult = {
  orderId: string;
  amount: number;
  message: string;
  qrDataUrl: string;
  items: Array<{ id: string; name: string; price: number; qty: number }>;
};

export const WALLFLOW_URL = String(import.meta.env.VITE_WALLFLOW_URL ?? "https://wallflow.muddy-rice-38d4.workers.dev").replace(
  /\/$/,
  "",
);

export const CATALOG_POLL_MS = 5 * 60 * 1000;

export async function fetchCatalogRevision() {
  const res = await fetch(`${WALLFLOW_URL}/kiosk/revision`, { cache: "no-store" });
  const data = (await res.json()) as { ok?: boolean; revision?: number; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || "Kunde inte läsa katalogversion");
  return Number(data.revision) || 0;
}

export async function fetchCatalog() {
  const res = await fetch(`${WALLFLOW_URL}/kiosk/catalog`, { cache: "no-store" });
  const data = (await res.json()) as Catalog & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || "Kunde inte hämta katalogen");
  return data;
}

export async function recordKioskSale(payload: {
  orderId: string;
  amount: number;
  message: string;
  items: Array<{ id: string; name: string; price: number; qty: number }>;
}) {
  try {
    await fetch(WALLFLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
      body: JSON.stringify({ action: "recordKioskSale", token: "", args: [payload] }),
    });
  } catch {
    /* kassan ska kunna visa Swish även om loggning misslyckas */
  }
}
