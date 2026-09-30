import QRCode from "qrcode";

function swishPaymentUrl(payee: string, amount: number, message: string) {
  const params = new URLSearchParams();
  params.set("sw", payee);
  params.set("amt", amount.toFixed(2));
  params.set("msg", message);
  return `https://app.swish.nu/1/p/sw/?${params.toString()}`;
}

function clearSquare(data: Uint8Array, size: number, x: number, y: number, side: number) {
  for (let yOffset = 0; yOffset < side; yOffset++) {
    for (let xOffset = 0; xOffset < side; xOffset++) {
      data[(y + yOffset) * size + x + xOffset] = 0;
    }
  }
}

function circles(size: number, data: Uint8Array) {
  let result = "";
  let cx = 4;
  let cy = 4;
  const rowStopsAt = 4 + size - 1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) result += `<circle cx="${cx}.5" cy="${cy}.5" r="0.45"/>`;
    if (cx === rowStopsAt) {
      cx = 4;
      cy += 1;
    } else {
      cx += 1;
    }
  }
  return result;
}

function corners(size: number) {
  return (
    '<path fill="none" stroke="url(#v)" stroke-linejoin="round" stroke-width="1.0" d="M 4.5 10.5 v -0.875 a 5.125 5.125 0 0 1 5.125 -5.125 h 0.875 v 6 Z"/>' +
    '<path fill="url(#v)" d="M 6 9.125 a 3 3 0 0 1 3 -3 v 3 Z"/>' +
    `<path fill="none" stroke="url(#v)" stroke-linejoin="round" stroke-width="1.0" d="M 4.5 ${size - 3}.5 v 0.875 a 5.125 5.125 0 0 0 5.125 5.125 h 0.875 v -6 Z"/>` +
    `<path fill="url(#v)" d="M 6 ${size - 2}.875 a 3 3 0 0 0 3 3 v -3 Z"/>` +
    `<path fill="none" stroke="url(#v)" stroke-linejoin="round" stroke-width="1.0" d="M ${size + 3}.5 10.5 v -0.875 a 5.125 5.125 0 0 0 -5.125 -5.125 h -0.875 v 6 Z"/>` +
    `<path fill="url(#v)" d="M ${size + 2} 9.125 a 3 3 0 0 0 -3 -3 v 3 Z"/>`
  );
}

function logo(center: number, logoSize: number) {
  return `
  <g transform="translate(${(center + 4.8).toFixed(1)} ${(center + 4.8).toFixed(1)}) scale(${((logoSize - 1.8) / 420).toFixed(6)})">
    <path fill="url(#lg1)" d="M119.3,399.2c84.3,40.3,188.3,20.4,251.2-54.5,74.5-88.8,62.9-221.1-25.8-295.5l-59,70.3c69.3,58.2,78.4,161.5,20.2,230.9-46.4,55.3-122.8,73.7-186.5,48.9" />
    <path fill="url(#lg2)" d="M119.3,399.2c84.3,40.3,188.3,20.4,251.2-54.5,7.7-9.2,14.5-18.8,20.3-28.8,9.9-61.7-11.9-126.9-63.2-169.9-13-10.9-27.2-19.8-41.9-26.5,69.3,58.2,78.4,161.5,20.2,230.9-46.4,55.3-122.8,73.7-186.5,48.9" />
    <path fill="url(#lg3)" d="M300.3,20.4C216-19.9,111.9,0,49.1,74.9c-74.5,88.8-62.9,221.1,25.8,295.5l59-70.3c-69.3-58.2-78.4-161.5-20.2-230.9C160.2,14,236.6-4.5,300.3,20.4" />
    <path fill="url(#lg4)" d="M300.3,20.4C216-19.9,111.9,0,49.1,74.9c-7.7,9.2-14.5,18.8-20.3,28.8-9.9,61.7,11.9,126.9,63.2,169.9,13,10.9,27.2,19.8,41.9,26.5-69.3-58.2-78.4-161.5-20.2-230.9C160.2,14,236.6-4.5,300.3,20.4" />
  </g>`;
}

export function swishQrDataUrl(payee: string, amount: number, message: string) {
  const payload = swishPaymentUrl(payee, amount, message);
  const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = qr.modules.get(y, x) ? 1 : 0;
    }
  }

  const margin = 2;
  const fullSize = size + margin * 2;
  const centerSide = Math.round((0.2 * size + 3.4) / 2) * 2 - 1;
  const center = ((size - centerSide) / 2) | 0;
  clearSquare(data, size, 0, 0, 7);
  clearSquare(data, size, size - 7, 0, 7);
  clearSquare(data, size, 0, size - 7, 7);
  clearSquare(data, size, center, center, centerSide);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${4 - margin} ${4 - margin} ${fullSize} ${fullSize}" width="512" height="512">
    <defs>
      <linearGradient id="v" x1="0%" x2="100%" y1="100%" y2="0%" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#B43092"/>
        <stop offset="100%" stop-color="#EF4123"/>
      </linearGradient>
      <linearGradient id="lg1" x1="-746" x2="-746.2" y1="822.6" y2="823.1" gradientTransform="matrix(300.3 0 0 -370.5 224261 305063)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ef2131"/><stop offset="1" stop-color="#fecf2c"/>
      </linearGradient>
      <linearGradient id="lg2" x1="-745.4" x2="-745.9" y1="823" y2="822.1" gradientTransform="matrix(273.8 0 0 -300.2 204470 247194)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fbc52c"/><stop offset=".3" stop-color="#f87130"/><stop offset=".6" stop-color="#ef52e2"/><stop offset="1" stop-color="#661eec"/>
      </linearGradient>
      <linearGradient id="lg3" x1="-746" x2="-745.8" y1="823" y2="822.5" gradientTransform="matrix(300.3 0 0 -370.5 224142 305014)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#78f6d8"/><stop offset=".3" stop-color="#77d1f6"/><stop offset=".6" stop-color="#70a4f3"/><stop offset="1" stop-color="#661eec"/>
      </linearGradient>
      <linearGradient id="lg4" x1="-746.1" x2="-745.6" y1="822.3" y2="823.2" gradientTransform="matrix(273.8 0 0 -300.2 204377 247074)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#536eed"/><stop offset=".2" stop-color="#54c3ec"/><stop offset=".6" stop-color="#64d769"/><stop offset="1" stop-color="#fecf2c"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#fff"/>
    <g fill="url(#v)">${circles(size, data)}</g>
    ${corners(size)}
    ${logo(center, centerSide)}
  </svg>`.replace(/\n\s+/g, " ");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
