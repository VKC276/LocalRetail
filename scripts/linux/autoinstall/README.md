# Ubuntu 24.04 autoinstall — LocalRetail-kiosk

Obevakat installerar:

- Ubuntu 24.04 LTS (Server ISO + `ubuntu-desktop-minimal`)
- OpenSSH-server
- Chromium
- Autologin som användaren `kiosk`
- Autostart av kassan mot `https://retail.vastervikclimbing.se/?kiosk=1`

**Viktigt:** `storage.layout: direct` raderar hela disken på måldatorn.

---

## Linux / Pi (rekommenderat) — ett skript

På t.ex. Raspberry Pi 5, med USB inkopplad:

```bash
cd ~/LocalRetail
git pull
sudo apt-get install -y genisoimage curl python3
lsblk   # hitta USB, t.ex. /dev/sda
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda
```

Skriptet:

1. Frågar efter kiosk-lösenord (sparar hash i `user-data`)
2. Bygger `localretail-cidata.iso`
3. Laddar ner Ubuntu 24.04 Server (cachas i `out/cache/`)
4. Installerar Ventoy på USB (**raderar USB:n**)
5. Kopierar Ubuntu-ISO + cidata-ISO till USB:n

Med lösenord som argument:

```bash
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda 'DittLosen'
```

Sedan: USB i Oracle Workstation → boota → välj Ubuntu Server-ISO:n i Ventoy.

Om autoinstall inte startar: i GRUB, `e` och lägg till:

```text
autoinstall ds=nocloud;s=/cdrom/cidata/
```

### Bara seed-ISO (utan att skriva USB)

```bash
bash scripts/linux/autoinstall/prepare-usb.sh
# -> out/localretail-cidata.iso
```

---

## Windows

```powershell
cd scripts\linux\autoinstall
powershell -ExecutionPolicy Bypass -File .\prepare-usb.ps1
```

Sedan manuellt: Ventoy på USB, kopiera Ubuntu Server-ISO + `out\localretail-cidata.iso`.

---

## Efter install

Maskinen startar om, loggar in som `kiosk` och öppnar kassan.

```bash
ssh kiosk@<ip>
```

IP syns i routern eller med `hostname -I` innan kiosken tar över.

## Anpassa

| Inställning | Fil / plats |
|---|---|
| Hostname | `user-data` → `identity.hostname` |
| Användare | `user-data` → `identity.username` (default `kiosk`) |
| Kassa-URL | `open-kiosk.sh` → `LOCAL_RETAIL_URL` |
| Fast IP | `user-data` → `network` |
| SSH-nyckel | `user-data` → `ssh.authorized-keys` |

## Felsök

- Installer fastnar: kontrollera lösenordshash och att ISO är **24.04 Server**.
- Ingen SSH: `sudo systemctl status ssh`
- Ingen kiosk: `~/.config/autostart/local-retail-kiosk.desktop` och `/opt/localretail/bin/open-kiosk.sh`
- Kör om first-boot: `sudo rm /var/lib/localretail/kiosk-setup.done && sudo /usr/local/sbin/localretail-kiosk-setup.sh`
