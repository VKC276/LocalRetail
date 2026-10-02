# Ubuntu 24.04 autoinstall — LocalRetail-kiosk

Obevakat installerar:

- Ubuntu 24.04 LTS (Server ISO + `ubuntu-desktop-minimal`)
- OpenSSH-server
- Chromium
- Autologin som användaren `kiosk`
- Autostart av kassan mot `https://retail.vastervikclimbing.se/?kiosk=1`

**Viktigt:** `storage.layout: direct` raderar den största disken på måldatorn.

---

## Linux / Pi — ett skript

```bash
cd ~/LocalRetail
git pull
sudo apt-get install -y genisoimage curl python3
lsblk   # hitta USB, t.ex. /dev/sda
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda
```

Skriptet sätter lösenord, installerar Ventoy, kopierar Ubuntu Server till `/iso/`,
lägger seed i `/ventoy/cidata/` och **bakar in** kernel-raden:

```text
autoinstall ds=nocloud;s=/ventoy/cidata/ nomodeset
```

i Ubuntu-GRUB via Ventoy `conf_replace`. Du behöver **inte** trycka `e` i GRUB.

På kassadatorn: boota USB → välj Ubuntu-ISO:n (eller låt Ventoy-timeout) → autoinstall kör utan dialoger.

Med lösenord som argument:

```bash
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda 'DittLosen'
```

---

## Windows (manuellt)

```powershell
cd scripts\linux\autoinstall
powershell -ExecutionPolicy Bypass -File .\prepare-usb.ps1
```

Sedan Ventoy + kopiera ISO. För obevakad install: bygg hellre USB:n på Pi med `create-usb.sh` ovan.

---

## Efter install

```bash
ssh kiosk@<ip>
```

## Anpassa

| Inställning | Fil / plats |
|---|---|
| Hostname | `user-data` → `identity.hostname` |
| Användare | `user-data` → `identity.username` (default `kiosk`) |
| Kassa-URL | `open-kiosk.sh` → `LOCAL_RETAIL_URL` |
| Fast IP | `user-data` → `network` |
| SSH-nyckel | `user-data` → `ssh.authorized-keys` |

## Felsök

- Dialoger igen: bygg om USB med senaste `create-usb.sh` (måste ha `/ventoy/ventoy.json` + `ubuntu-server-autoinstall-grub.cfg`).
- Ingen SSH: `sudo systemctl status ssh`
- Ingen kiosk: `~/.config/autostart/local-retail-kiosk.desktop`
- Kör om first-boot: `sudo rm /var/lib/localretail/kiosk-setup.done && sudo /usr/local/sbin/localretail-kiosk-setup.sh`
