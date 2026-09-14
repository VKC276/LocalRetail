export const PRODUCT_ICON_IDS = new Set([
  "ticket",
  "pass",
  "shoes",
  "boot",
  "drink",
  "coffee",
  "water",
  "energy",
  "juice",
  "bottle",
  "cookie",
  "candy",
  "lollipop",
  "chocolate",
  "icecream",
  "fruit",
  "banana",
  "chips",
  "sandwich",
  "hotdog",
  "salad",
  "bread",
  "climb",
  "bag",
  "shirt",
  "hoodie",
  "book",
  "brush",
  "bottle-care",
  "chalk",
  "key",
  "cart",
]);

export function normalizeIcon(icon: unknown) {
  if (typeof icon !== "string" || !PRODUCT_ICON_IDS.has(icon)) return null;
  return icon;
}
