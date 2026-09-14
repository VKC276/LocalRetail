export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  icon?: string | null;
  featured?: boolean;
  imageUrl: string | null;
  active?: boolean;
  sort?: number;
};

export type CartItem = Product & { qty: number };

export type Theme = "light" | "dark" | "bold" | "contrast";

export type Catalog = {
  shopName: string;
  theme?: Theme;
  logoUrl?: string | null;
  swishConfigured: boolean;
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

export type SalesReport = {
  from: string;
  to: string;
  orderCount: number;
  itemCount: number;
  totalAmount: number;
  categories: Array<{
    category: string;
    qty: number;
    amount: number;
    products: Array<{ id: string; name: string; category: string; qty: number; amount: number }>;
  }>;
};

export const API_BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  return apiUrl(path);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {};
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...rest,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Något gick fel");
  return data;
}

export async function downloadApi(path: string, filename: string) {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error("Kunde inte hämta filen");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
