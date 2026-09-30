# LocalRetail

Självbetjäning för kassan. Sidan körs på **GitHub Pages**. Varor, priser och bilder administreras i **WallFlow** (admin, superadmin eller kassör).

## Kassa

Efter deploy: [https://retail.vastervikclimbing.se/](https://retail.vastervikclimbing.se/)

I GitHub: **Settings → Pages → Deploy from a branch** → branch `gh-pages`, folder `/ (root)`. Custom domain: `retail.vastervikclimbing.se`.

Kassan läser **en rad** (`/kiosk/revision`) var femte minut. Bara om revisionen ändrats hämtas katalogen, och bara nya bildhashar laddas hem. Övriga bilder ligger kvar i kassans IndexedDB.

Swish-QR skapas i webbläsaren. Swish-nummer sätts i WallFlow under **Ekonomi → Kassasortiment**.

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

## Utveckling

```bash
npm install
cp .env.example .env
npm run dev
```
