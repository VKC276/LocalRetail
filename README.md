# LocalRetail

Självbetjäning och admin för lokal kassa. En Linuxdator i butiken servar både kiosken och adminsidan på det lokala nätet.

## På kassadatorn

```bash
git clone <url-till-LocalRetail> ~/LocalRetail
cd ~/LocalRetail
chmod +x scripts/linux/*.sh
./scripts/linux/install.sh
```

Efter installation:

- Kassa: `http://DATORNS-IP:8080/`
- Admin: `http://DATORNS-IP:8080/admin` (pinkod, första gången `1234`)
- Vid uppstart/inloggning öppnas kassan i kioskläge (helskärm)

Uppdatera senare:

```bash
~/LocalRetail/scripts/linux/update.sh
```

Sätt automatisk inloggning för kassaanvändaren så kiosken kommer upp utan att någon behöver logga in för hand.

Installationen slår på SSH-server på kassadatorn. Anslut med Windows inbyggda OpenSSH eller valfri klient:

```text
ssh ANVÄNDARE@DATORNS-IP
```

## Utveckling

```bash
npm install
npm run dev
```

Öppna `http://localhost:5173/` och `http://localhost:5173/admin`.
