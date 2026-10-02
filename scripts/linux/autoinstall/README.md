# Ubuntu 24.04 autoinstall — LocalRetail-kiosk

Obevakat installerar:

- Ubuntu 24.04 LTS (Server ISO + `ubuntu-desktop-minimal`)
- OpenSSH-server
- Chromium
- Autologin som användaren `kiosk`
- Autostart av kassan mot `https://retail.vastervikclimbing.se/?kiosk=1`

**Viktigt:** `storage.layout: direct` raderar hela disken.

---

## Windows (rekommenderat hos er)

### A. Förbered seed

I PowerShell från repot:

```powershell
cd scripts\linux\autoinstall
.\prepare-usb.ps1
```

Skriptet frågar efter lösenord, skriver hash till `user-data`, skapar `out\cidata\` och försöker bygga `out\localretail-cidata.iso`.

Bara hash:

```powershell
.\make-password.ps1 'DittLösen'
```

Kräver **Git for Windows** (openssl) eller **WSL**.

### B. Skapa USB med Ventoy

1. Ladda ner [Ventoy](https://www.ventoy.net/) och kör `Ventoy2Disk.exe` → installera på USB (raderar USB:n).
2. Ladda ner **Ubuntu 24.04 LTS Server** (amd64):  
   https://ubuntu.com/download/server
3. Kopiera till USB:n (Ventoy-partitionen):
   - `ubuntu-24.04.x-live-server-amd64.iso`
   - `scripts\linux\autoinstall\out\localretail-cidata.iso`
4. Sätt USB i Oracle Workstation, boota från USB.
5. Välj Ubuntu Server-ISO:n i Ventoy-menyn.

Om autoinstall inte startar: i GRUB, `e` för att redigera och lägg till:

```text
autoinstall ds=nocloud;s=/cdrom/cidata/
```

### C. Om ISO inte kunde skapas

`prepare-usb.ps1` har då skapat mappen `out\cidata\`. Packa den till ISO med volymetikett **cidata**:

- [ImgBurn](https://www.imgburn.com/) → Build → lägg in filerna → Volume Label `cidata` → spara `localretail-cidata.iso`

Eller WSL:

```powershell
wsl sudo apt-get install -y genisoimage
.\prepare-usb.ps1
```

---

## Linux / macOS

```bash
bash scripts/linux/autoinstall/make-password.sh 'DittLösen'
# klistra in hash i user-data
bash scripts/linux/autoinstall/prepare-usb.sh
```

Sedan samma Ventoy-steg som ovan.

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

- Installer fastnar: kontrollera att lösenordshashen är ifylld och att ISO är **24.04 Server**.
- Ingen SSH: `sudo systemctl status ssh`
- Ingen kiosk: `~/.config/autostart/local-retail-kiosk.desktop` och `/opt/localretail/bin/open-kiosk.sh`
- Kör om first-boot: `sudo rm /var/lib/localretail/kiosk-setup.done && sudo /usr/local/sbin/localretail-kiosk-setup.sh`
