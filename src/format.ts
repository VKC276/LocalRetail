export function formatSek(amount: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
