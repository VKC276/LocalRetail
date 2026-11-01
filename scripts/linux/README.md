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

På **samma** Lubuntu-dator som visar `retail.vastervikclimbing.se` installeras
kiosk-**agenten** (läser USB-läsaren och skickar till Cloudflare). Chromium från
Kiosk-repot installeras **inte** — Retail-kiosken öppnas redan via `install.sh`.

```bash
# Valfritt: sätt token direkt
export KIOSK_TOKEN='samma-som-wrangler-secret-KIOSK_TOKEN'
# Valfritt: eget id (måste matcha WallFlow → Kassainställningar → kiosk-id)
export KIOSK_ID=reception

bash ~/LocalRetail/scripts/linux/install-card-reader.sh
```

Sedan:

```bash
# YAROGNTEC / SDZNKJLTD (ffff:0035) — krävs ofta, annars kan USB bli ostabilt
sudo vkc-kiosk setup-reader
sudo reboot

vkc-kiosk configure-reader
vkc-kiosk save-config
sudo systemctl enable --now vkc-kiosk
vkc-kiosk status
```

**Viktigt:** `CLOUDFLARE.kioskId` i `~/vkc-kiosk/config.json` måste vara **samma**
värde som under WallFlow → Självbetjäningskassa → Kassainställningar → kiosk-id
(standard `reception`). Då syns blippen i Retail under **Klipp 10 kort**.

Token: samma secret som `npx wrangler secret put KIOSK_TOKEN` i Kiosk-Workern —
**inte** admin-token.
