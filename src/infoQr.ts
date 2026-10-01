import QRCode from "qrcode";

/** Generisk QR som data-URL för startsidans medlems-/Epassi-länkar. */
export function textQrDataUrl(text: string) {
  const payload = String(text || "").trim();
  if (!payload) return "";
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const margin = 2;
  const full = size + margin * 2;
  let cells = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(y, x)) {
        cells += `<rect x="${x + margin}" y="${y + margin}" width="1" height="1"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="512" height="512">
    <rect width="100%" height="100%" fill="#fff"/>
    <g fill="#111">${cells}</g>
  </svg>`.replace(/\n\s+/g, " ");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
