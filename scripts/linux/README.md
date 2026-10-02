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
