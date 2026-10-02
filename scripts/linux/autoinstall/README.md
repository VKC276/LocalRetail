# Ubuntu 24.04 autoinstall — LocalRetail-kiosk

Obevakat installerar:

- Ubuntu 24.04 LTS (Server ISO + `ubuntu-desktop-minimal`)
- OpenSSH-server
- Chromium
- Autologin som användaren `kiosk`
- Autostart av kassan mot `https://retail.vastervikclimbing.se/?kiosk=1`

**Viktigt:** `storage.layout: direct` raderar hela disken.

## 1. Förbered lösenord

På Linux/WSL/macOS:

```bash
bash scripts/linux/autoinstall/make-password.sh 'DittLösen'
```

Klistra in hashen i `user-data` där det står `REPLACE_WITH_PASSWORD_HASH`.

Lägg gärna in din SSH-nyckel under `ssh.authorized-keys` i samma fil.

## 2. Bygg seed-ISO

```bash
bash scripts/linux/autoinstall/prepare-usb.sh
```

Skapar `scripts/linux/autoinstall/out/localretail-cidata.iso`.

## 3. USB med Ventoy (enklast)

1. Installera [Ventoy](https://www.ventoy.net/) på USB.
2. Kopiera dit:
   - `ubuntu-24.04.x-live-server-amd64.iso`
   - `localretail-cidata.iso`
3. Boota från USB på Oracle Workstation.
4. Välj Ubuntu Server-ISO:n. Ventoy/autoinstall ska plocka upp `cidata`.

Om autoinstall inte startar, redigera GRUB-raden och lägg till:

```text
autoinstall ds=nocloud;s=/cdrom/cidata/
```

## 4. Efter install

Maskinen startar om, loggar in som `kiosk` och öppnar kassan.

SSH:

```bash
ssh kiosk@<ip>
```

IP syns i routern eller via skärm/terminal innan kiosken tar över (`hostname -I`).

## Anpassa

| Inställning | Fil / plats |
|---|---|
| Hostname | `user-data` → `identity.hostname` |
| Användare | `user-data` → `identity.username` (default `kiosk`) |
| Kassa-URL | `open-kiosk.sh` → `LOCAL_RETAIL_URL` |
| Fast IP | `user-data` → `network` |

## Felsök

- Installer fastnar: kontrollera att lösenordshashen är ifylld och att ISO är **24.04 Server**.
- Ingen SSH: `sudo systemctl status ssh` efter inloggning.
- Ingen kiosk: kolla `~/.config/autostart/local-retail-kiosk.desktop` och `/opt/localretail/bin/open-kiosk.sh`.
- Kör om first-boot: `sudo rm /var/lib/localretail/kiosk-setup.done && sudo /usr/local/sbin/localretail-kiosk-setup.sh`
