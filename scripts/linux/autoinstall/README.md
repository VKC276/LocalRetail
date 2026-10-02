# Ubuntu 24.04 autoinstall — LocalRetail-kiosk

Obevakat installerar:

- Ubuntu 24.04 LTS + skrivbord (minimal)
- OpenSSH, GDM autologin som `kiosk`, Xorg (inte Wayland)
- Chromium i kioskläge mot `https://retail.vastervikclimbing.se/?kiosk=1`
- `nomodeset` i GRUB (stabilare på tunn klient / Oracle Workstation)

**Viktigt:** raderar den största disken på måldatorn.

---

## Bygg USB (Pi5)

```bash
cd ~/LocalRetail
git pull
# Om du redan har en gammal password-hash och vill byta:
#   sed -i 's/password: "\$6\$[^"]*"/password: "REPLACE_WITH_PASSWORD_HASH"/' scripts/linux/autoinstall/user-data
sudo apt-get install -y genisoimage curl python3
lsblk
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda
```

Skriv `JA`, ange kiosk-lösenord när det frågas (eller: `.../create-usb.sh /dev/sda 'DittLosen'`).

## Installera kassa

1. Boota USB på Oracle Workstation  
2. Ventoy: välj Ubuntu Server-ISO:n under `/iso` (eller vänta timeout)  
3. GRUB ska visa **Install LocalRetail kiosk (autoinstall)** och starta själv  
4. Vänta (desktop-paket tar ofta 15–40 min). Skärmen kan vara mörk — det är OK om disken/nät jobbar  
5. Omstart → autologin som `kiosk` → kassan öppnas  

SSH: `ssh kiosk@<ip>`

## Felsök

- Dialoger / manuell installer: USB saknar `ventoy/ventoy.json` — kör om `create-usb.sh` efter `git pull`
- Reboot-loop: i GRUB `e` → lägg till `systemd.unit=multi-user.target nomodeset` → inaktivera kiosk-autostart
