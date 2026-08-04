# SafeLock Packaging — Walkthrough & Learning Guide

> **Purpose:** This is the learning companion to [PACKAGING.md](PACKAGING.md). It explains *how* the desktop packaging works and *how to repeat it yourself* when a requirement changes. PACKAGING.md is the phased implementation guide; this file is the mental model.

---

## 1. The pipeline at a glance

```
frontend/ (React + TS source)
   │  npm run build                     (Vite compiles to plain HTML/CSS/JS)
   ▼
frontend/dist/   index.html + assets/*.js,*.css
   │  copied into static/               (Flask serves these)
   ▼
static/          the web app as static files
   │
desktop/safelock.spec  ← bundles launcher.py + app.py + all Python + static/ + icons
   │  pyinstaller --onefile
   ▼
dist/SafeLock.exe   self-extracting exe ("frozen" app)
   │
desktop/installer.iss  ← wraps the exe in a Windows installer
   │  ISCC.exe (Inno Setup 6)
   ▼
desktop/Output/SafeLockSetup.exe   ← THE artifact you ship
```

`desktop/build.ps1` runs steps 1–4 in order. **One command = whole thing:**

```powershell
.\desktop\build.ps1
```

---

## 2. The single most important idea: two modes, one codebase

The app has two lives:

| | Dev mode | Frozen exe |
|---|---|---|
| launch | `python launcher.py` | `dist\SafeLock.exe` |
| reads bundled files from | project folder | inside the exe (`sys._MEIPASS`) |
| writes data to | project folder | `%LOCALAPPDATA%\SafeLock` |

That's what `resource_path()` and `data_dir()` in `launcher.py`/`app.py` solve — they detect `sys.frozen` and pick the right base. **The rule:**

> **Code & static files get bundled INTO the exe. Mutable data (safe.db, images, webview profile) lives OUTSIDE it.**

That's why deleting `safe.db` in `%LOCALAPPDATA%` resets your admin password but doesn't break the app — the DB was never inside the exe.

---

## 3. How PyInstaller knows what to bundle (`desktop/safelock.spec`)

It's a Python file. Three parts matter:

```python
datas = [
    ('../static', 'static'),     # the built dashboard
    ('icon.png', 'desktop'),     # tray icon for resource_path
] + collect_data_files('simple_websocket')

hiddenimports = ['flask_sock', 'simple_websocket', 'clr']
```

- **`datas`** = non-code files shipped into the exe. Flask needs `static/` to serve the dashboard.
- **`hiddenimports`** = modules PyInstaller can't see by static analysis. `flask_sock`/`simple_websocket` are imported dynamically; `clr` is how pywebview talks to .NET/WebView2.
- **Gotcha:** *relative paths in a spec resolve from the spec file's folder*, not the project root. That's why everything is `../` — `launcher.py`, `static/`, etc.

**When you add a Python dependency:** `pip install` it, confirm it's `import`ed somewhere, and if it's imported dynamically (like a websocket lib), add it to `hiddenimports`.

---

## 4. What the installer does (`desktop/installer.iss`)

Inno Setup is a script-file-driven wizard. Sections:

```
[Setup]     app name/version, install dir ({autopf}\SafeLock), icon, admin elevation
[Files]     source: ../dist/SafeLock.exe  →  {app}\SafeLock.exe
[Tasks]     optional "Start with Windows" + desktop shortcut
[Registry]  HKCU\...\Run key  →  "C:\Program Files\SafeLock\SafeLock.exe" --minimized
[Run]       netsh firewall add rule (LAN access), then "Launch SafeLock" checkbox
[UninstallRun]  netsh firewall delete rule
```

The firewall add/delete are wrapped in `|| exit /b 0` so they're **idempotent** — rerunning the installer or uninstalling when the rule's already gone won't error.

---

## 5. When a requirement changes — your decision tree

**"I changed the dashboard" (most common)**
→ Run `desktop\build.ps1`. That's it.

**"I changed backend Python code"**
→ Run `desktop\build.ps1`. Same thing.

**"Can I skip steps if only one thing changed?"**
→ **No.** `static/` is *baked into the exe*, and the exe is baked into the installer. Any frontend change forces the full chain. Backend-only change *could* skip `npm run build`, but running the full script is simpler and safe. Just always run `build.ps1`.

**"I changed the listening port (5000 → 9000)"**
→ Touch **four places**:
- `launcher.py`: `PORT = ...`
- `desktop/installer.iss`: `localport=...` (firewall rule)
- `frontend/vite.config.ts`: `/api` proxy (dev only)
- Any ESP32 firmware that points at the IP/port

**"I changed the app name / icon"**
→ Touch: `desktop/icon.ico` + `icon.png` (assets), `safelock.spec` `name=`, `launcher.py` `APP_NAME`, `installer.iss` `#define`s + registry/firewall names. Firewall rule name, registry value name, and app name should stay consistent.

**"I changed the admin password"**
→ Edit `config.py` (`DEFAULT_ADMIN_PASSWORD`), then `build.ps1`. Rebuild matters — the hash is seeded at first start from that value.

**"I added a new API endpoint"**
→ Backend + frontend changes, then `build.ps1`. No packaging changes.

---

## 6. Manual rebuild (when you want fine control)

```powershell
# just the exe (after a backend-only edit):
.venv\Scripts\pyinstaller.exe desktop/safelock.spec --noconfirm --clean

# just the installer (exe already rebuilt):
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" desktop\installer.iss
```

---

## 7. How to verify you didn't break anything

1. Run `dist\SafeLock.exe` → dashboard window opens.
2. Check `%LOCALAPPDATA%\SafeLock` got `safe.db` + `images\`.
3. `python verify_backend.py` → 17/17.
4. LAN: `http://<your-ip>:5000/api/device/status` from another device (firewall rule on).

---

## 8. How we got here — the layered development journey

The build.ps1 pipeline was **not designed upfront** — it's the automation of a dependency chain discovered along the way. Each layer was built and verified before the next (the PACKAGING.md rule: *"Do not skip verification gates"*):

1. **Make the app path-aware (`app.py`)** — `resource_path()`/`data_dir()` for dev-vs-frozen. Done first because *if paths are wrong, nothing else works*. Tested with `python app.py` + the 17/17 test suite (proving dev mode wasn't broken).

2. **The launcher script (`launcher.py`)** — the thing that would *become* the exe: Flask in a background thread, pywebview native window, tray icon, close-to-tray, auto-start, firewall toggles. Debugged entirely in dev mode where errors print to a console — before PyInstaller ever got involved.

3. **Freeze it (`safelock.spec` → `dist\SafeLock.exe`)** — PyInstaller bundles entry point + `static/` + icons. Tested **from a neutral directory**, not the project folder — running it in the project would accidentally pass because `static/` and `safe.db` are lying around; a real user won't have those.

4. **Wrap it (`installer.iss` → `SafeLockSetup.exe`)** — shortcuts, tasks, registry, firewall rules on install/uninstall.

5. **Automate it (`build.ps1`)** — chains all of the above. Exists because of one insight:

> **`static/` is baked into the exe at build time.** Flask doesn't read the React source; the exe contains a snapshot of the built dashboard. So a frontend change is *npm build → copy into `static/` → rebundle exe → rewrap installer* — a 4-step dependency chain, exactly what `build.ps1` codifies.

**Why this order:** each phase isolates a different failure class:

| Layer | Failure it catches cheaply |
|---|---|
| Paths | Wrong folder logic — visible in seconds with `python app.py` |
| Launcher | Window/tray/firewall bugs — debuggable with console output |
| PyInstaller | Missing modules/assets, packaging-only path bugs |
| Installer | Shortcuts, elevation, registry, uninstall cleanup |
| build.ps1 | Pure automation — nothing new to fail |

If we'd jumped straight to an installer, a path bug would be buried inside a 25MB black-box exe with no console. Each gate made the *next* step's debugging surface smaller.

---

## Quick reference

- **Run in dev:** `python app.py` / `python launcher.py`
- **Build everything:** `desktop\build.ps1`
- **User data:** `%LOCALAPPDATA%\SafeLock\`
- **Install output:** `desktop\Output\SafeLockSetup.exe`
- **Admin password:** `config.py` → `DEFAULT_ADMIN_PASSWORD` (prebuilt, no in-app reset; recovery = delete `admin_auth` row or `safe.db`, restart)
