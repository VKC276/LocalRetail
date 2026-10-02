# Ubuntu 24.04 autoinstall — LocalRetail-kiosk (Openbox)

Lättviktskiosk: **Ubuntu Server + Openbox + LightDM + Chromium** (inte GNOME).

Autoinstall sätter hostname `kiosk-01`, användare `kiosk`, svensk layout, SSH.

**Viktigt:** raderar största disken. Dialoger om namn/användare = autoinstall är **inte** aktiv.

En färdig desktop-ISO (Ubuntu Desktop/Lubuntu) tar **inte** bort frågorna — samma seed/GRUB behövs. Server+Openbox är lättare och stabilare på Workstation 6.

---

## Bygg USB (Pi5)

```bash
cd ~/LocalRetail
git pull
sed -i 's/password: "\$6\$[^"]*"/password: "REPLACE_WITH_PASSWORD_HASH"/' scripts/linux/autoinstall/user-data
sudo apt-get install -y genisoimage curl python3 dosfstools
lsblk
sudo bash scripts/linux/autoinstall/create-usb.sh /dev/sda
```

## Installera

1. Boota USB → välj Ubuntu Server under `/iso`  
2. Ev. persistence: `localretail-cidata`  
3. GRUB: **Install LocalRetail kiosk (autoinstall)** ska starta själv  
4. Inga frågor om namn/username  

Om dialoger: i GRUB `e` och kontrollera att `linux`-raden har `autoinstall ds=nocloud;s=/ventoy/cidata/`.

SSH: `ssh kiosk@<ip>`
