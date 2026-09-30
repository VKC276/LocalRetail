export function formatSek(amount: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function swishCheckoutMessage(orderId: string, items: Array<{ name: string; qty: number }>) {
  const id = orderId.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
  const bits = items.map((item) => (item.qty > 1 ? `${item.name} x${item.qty}` : item.name));
  const prefix = `${id} `;
  let detail = bits.join(", ");
  const max = 50;
  if (prefix.length >= max) return id.slice(0, max);
  if (prefix.length + detail.length > max) {
    detail = detail.slice(0, Math.max(0, max - prefix.length)).trim();
  }
  return `${prefix}${detail}`.trim().slice(0, max);
}
