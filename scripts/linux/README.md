# Lubuntu-kiosk (LocalRetail)

Kassadatorn kör **Lubuntu** manuellt installerad. Ingen autoinstall/Ventoy.

## 1. Installera Lubuntu

1. Ladda ner [Lubuntu 24.04 LTS](https://lubuntu.me/downloads/) (amd64)
2. Skriv USB med Rufus eller balenaEtcher
3. Boota USB på kassan (F12 → USB)
4. Installera: svenska, skapa användare (t.ex. `kiosk`), aktivera OpenSSH om möjligt

## 2. Aktivera kiosk

Efter inloggning:

```bash
cd ~
git clone https://github.com/VKC276/LocalRetail.git
# eller: git pull om repot redan finns
bash ~/LocalRetail/scripts/linux/install.sh
```

Detta installerar Chromium (vid behov), aktiverar SSH och sätter autostart av kassan.

## 3. Automatisk inloggning (Lubuntu / SDDM)

Så kiosken startar utan lösenord vid boot:

```bash
sudo mkdir -p /etc/sddm.conf.d
echo -e "[Autologin]\nUser=$USER\nSession=lxqt" | sudo tee /etc/sddm.conf.d/autologin.conf
sudo reboot
```

Byt `Session=lxqt` om er session heter något annat (se `/usr/share/xsessions/`).

## SSH

```bash
ssh kiosk@<ip>
```

IP: `hostname -I` på kassan.

## Uppdatera skript

```bash
bash ~/LocalRetail/scripts/linux/update.sh
```

Kassans webbinnehåll kommer från GitHub Pages; ingen lokal webserver.

---

## 4. Kortläsare (Klipp 10 kort)

På **samma** Lubuntu-dator som visar `retail.vastervikclimbing.se` körs bara
**kortläsar-agenten** (från Kiosk-repot). Den skickar blipp till Cloudflare Worker-API.
Receptionsskärmen har **ingen** nedre kortyta längre — allt klipp/status sker här.

- **Ingen** beroende av receptionens kioskskärm / karusell
- **Ingen** Chromium från Kiosk-install (`SKIP_BROWSER=1`)
- Eget kanal-id **`retail`** (dela inte `reception` med den gamla skärmen)
- På kiosk-Pi:n: `sudo systemctl disable --now vkc-kiosk` (lämna browser/karusell)

```bash
export KIOSK_TOKEN='samma-som-wrangler-secret-KIOSK_TOKEN'
export KIOSK_ID=retail   # default i skriptet

bash ~/LocalRetail/scripts/linux/install-card-reader.sh
```

Sedan:

```bash
# YAROGNTEC / SDZNKJLTD (ffff:0035) — krävs ofta
sudo vkc-kiosk setup-reader
sudo reboot

vkc-kiosk configure-reader
vkc-kiosk save-config
sudo systemctl enable --now vkc-kiosk
vkc-kiosk status
```

Installskriptet sätter `CLOUDFLARE.kioskId=retail` automatiskt (samma id som
Retail-webben använder). Ingen admin-inställning i WallFlow behövs — bara
kryssrutan **Visa Klipp 10 kort**.

Token: samma secret som `npx wrangler secret put KIOSK_TOKEN` — **inte** admin-token.
