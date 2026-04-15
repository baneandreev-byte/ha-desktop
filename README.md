# HA Desktop
**Multi-location Home Assistant controller — Tauri + Glassmorphism dark UI**

Biro Andreev d.o.o. — interni alat

---

## Preduvjeti

Instaliraj jednom:

```bash
# 1. Rust (https://rustup.rs)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# ili na Windows-u: https://win.rustup.rs/x86_64

# 2. Node.js 18+ (https://nodejs.org)

# 3. WebView2 (samo Windows, obično već instaliran s Edge)
#    https://developer.microsoft.com/microsoft-edge/webview2/

# 4. Tauri CLI dependencies (Linux)
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## Razvoj (dev mode)

```bash
cd ha-desktop
npm install
npm run dev
```

Otvara se prozor aplikacije + hot reload.

---

## Build za produkciju

```bash
npm run build
```

Generiše:
- `src-tauri/target/release/ha-desktop.exe` (Windows)
- `src-tauri/target/release/bundle/` → `.msi`, `.exe` installer

---

## Dodavanje ikona

Zamijeni placeholder ikonice:
```
src-tauri/icons/32x32.png
src-tauri/icons/128x128.png
src-tauri/icons/128x128@2x.png
src-tauri/icons/icon.icns
src-tauri/icons/icon.ico
```

Možeš koristiti `tauri icon` CLI:
```bash
npx @tauri-apps/cli icon ./ha-logo.png
```

---

## Konfiguracija HA long-lived tokena

U Home Assistant:
1. **Profil** (lijevo dno) → **Sigurnost**
2. **Dugotrajni pristupni tokeni** → **Stvori token**
3. Kopiraj token u aplikaciju

---

## Funkcionalnosti

- ✅ Višestruke HA lokacije (tabovi, neograničen broj)
- ✅ Widgets prikaz — svjetla, prekidači, senzori, klima, scene...
- ✅ Full HA prikaz (embedded browser unutar aplikacije)
- ✅ Toggle svetla/prekidača direktno iz widgeta
- ✅ Aktivacija scena i skripti klikom
- ✅ Auto-refresh svakih 15 sekundi
- ✅ Status indikator veze (online/offline) po tabu
- ✅ Pretraga i filtriranje entiteta
- ✅ Desni klik na tab → kontekstni meni
- ✅ Glassmorphism dark UI, frameless prozor
- ✅ Lokalno čuvanje konfiguracije (localStorage / Tauri store)
- ✅ Self-signed SSL sertifikati podržani (za lokalne HA instance)

---

## Folder struktura

```
ha-desktop/
├── src/
│   ├── index.html    — UI markup
│   ├── style.css     — Glassmorphism dark theme
│   └── app.js        — Sva logika, HA API, state management
├── src-tauri/
│   ├── src/
│   │   ├── main.rs   — Entry point
│   │   └── lib.rs    — Rust Tauri komande (HA API pozivi, window kontrole)
│   ├── Cargo.toml    — Rust zavisnosti
│   └── tauri.conf.json — Tauri konfiguracija
├── package.json
└── README.md
```
