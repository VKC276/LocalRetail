# LocalRetail

Självbetjäning för kassan. Sidan körs på **GitHub Pages**. Varor, priser och bilder administreras i **WallFlow** (admin, superadmin eller kassör).

## Kassa

Efter deploy: [https://retail.vastervikclimbing.se/](https://retail.vastervikclimbing.se/)

I GitHub: **Settings → Pages → Deploy from a branch** → branch `gh-pages`, folder `/ (root)`. Custom domain: `retail.vastervikclimbing.se`.

Kassan läser **en rad** (`/kiosk/revision`) var femte minut. Bara om revisionen ändrats hämtas katalogen, och bara nya bildhashar laddas hem. Övriga bilder ligger kvar i kassans IndexedDB.

Swish-QR skapas i webbläsaren. Swish-nummer sätts i WallFlow under **Ekonomi → Självbetjäningskassa**.

## WallFlow (en gång)

```bash
cd cloudflare
npx wrangler d1 execute wallflow --remote --file=migrations/0008_kiosk_catalog.sql
npx wrangler deploy
```

Publicera WallFlow-frontenden som vanligt (`index.html` + `kiosk-catalog.js`).

## Linux-kiosk

```bash
bash scripts/linux/install.sh
```

Öppnar GitHub Pages i Chromium kioskläge. SSH-server installeras; ingen lokal webserver.

## Windows-kiosk

1. Installera **Chrome** eller **Edge**.
2. Kör `scripts\windows\open-kiosk.bat` (dubbelklicka).

Det öppnar [https://retail.vastervikclimbing.se/?kiosk=1](https://retail.vastervikclimbing.se/?kiosk=1) i helskärm (`--kiosk`). `?kiosk=1` döljer muspekaren.

**Autostart:** högerklicka `open-kiosk.bat` → Skapa genväg → lägg genvägen i  
`shell:startup` (Win+R → skriv `shell:startup`).

**Lämna kiosken:** Alt+F4, eller Alt+Tab tillbaka till skrivbordet.

**Striktare låsning (valfritt):** Windows-inställningar → Konton → Inloggningsalternativ / Kiosk (Assigned Access) med Edge och samma URL.

## Utveckling

```bash
npm install
cp .env.example .env
npm run dev
```
