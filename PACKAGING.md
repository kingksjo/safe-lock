# SafeLock Desktop Packaging — Phased Implementation Guide

> **Goal:** Ship the SafeLock Flask + React app as `SafeLockSetup.exe` — the user installs it, launches SafeLock, and a native window opens straight into the dashboard. The server stays in the system tray with optional Windows auto-start so the ESP32 hardware can always reach it.
>
> **Stack:** PyInstaller (onefile exe) · pywebview (native window) · pystray (system tray) · Inno Setup 6 (installer)
>
> **Rule:** Do not skip verification gates. Each phase must pass before the next is started.
>
> **Learning companion:** see [PACKAGING_WALKTHROUGH.md](PACKAGING_WALKTHROUGH.md) for the mental model and how to repeat this process when requirements change.

---

## Current Status

| Phase | Status |
|---|---|
| 0 — Prerequisites | ✅ Done |
| 1 — Frozen-aware paths | ✅ Done |
| 2 — Native window (`launcher.py`) | ✅ Done |
| 3 — Tray icon + auto-start | ✅ Done |
| 4 — PyInstaller build | ✅ Done |
| 5 — Inno Setup installer + pipeline | ✅ Done |
| 6 — Hardware validation + docs | ⏳ Pending |

> **Auth note (added during packaging):** the dashboard now uses a **prebuilt server-side admin password** — `config.py` → `DEFAULT_ADMIN_PASSWORD`, seeded as a salted PBKDF2 hash in the `admin_auth` table on first start. There is **no setup screen and no in-app reset**; the packaged app opens straight to the lock screen. Forgotten-password recovery is operator-only (delete the `admin_auth` row or `safe.db`, then restart to re-seed). See spec.md §6.4.

---

## Phase 0 — Prerequisites

**Goal:** All build tooling present.

**Steps:**

1. Install **Inno Setup 6** from [jrsoftware.org](https://jrsoftware.org/isinfo.php). On this machine it is **not** on PATH — use the full path `C:\Program Files (x86)\Inno Setup 6\ISCC.exe` in `build.ps1`.
2. Into the project `.venv`:
   ```powershell
   .venv\Scripts\python.exe -m pip install pyinstaller pywebview pystray pillow
   ```
3. Add the same packages to `requirements.txt` (keep the existing entries).
4. Create the `desktop/` folder and produce:
   - `desktop/icon.png` — used by the tray icon.
   - `desktop/icon.ico` — used by the installer and the Windows exe.
   These can be derived from `frontend/public/favicon.svg` or generated programmatically.

**Verification Gate:**

```powershell
.venv\Scripts\python.exe -m pip show pyinstaller pywebview pystray pillow
iscc /?
```

Both must succeed.

---

## Phase 1 — Frozen-aware paths in `app.py`

**Goal:** The app works exactly as before during development, but is also ready to run from a frozen executable.

**Steps:**

1. Add two helpers near the top of `app.py`:
   - `resource_path(rel)` — returns `sys._MEIPASS` when frozen, otherwise the project root. Used for the bundled `static/` folder.
   - `data_dir()` — returns `%LOCALAPPDATA%\SafeLock` when frozen (create it on first run), otherwise the project root. Used for `safe.db` and `images/`.
2. Wire the Flask app:
   - `static_folder=resource_path('static')`
   - `SQLALCHEMY_DATABASE_URI` → `sqlite:///<data_dir()>/safe.db`
   - `UPLOAD_FOLDER` → `<data_dir()>/images`
3. In `if __name__ == '__main__':`, force `debug=False` and `use_reloader=False` when frozen.

**Verification Gate:**

```powershell
.venv\Scripts\python.exe app.py
```

- `http://127.0.0.1:5000/` serves the dashboard.
- `http://127.0.0.1:5000/api/logs` returns data.
- `python verify_backend.py` still passes **17/17 tests** (11 original + 6 auth).

---

## Phase 2 — `launcher.py` (native window)

**Goal:** `python launcher.py` starts the server and opens the dashboard in a real desktop window.

**Steps:**

1. Create `launcher.py`:
   - Import `create_app` from `app.py`.
   - Start Flask in a background daemon thread:
     ```python
     app.run(host='0.0.0.0', port=5000, threaded=True, debug=False, use_reloader=False)
     ```
   - Before starting, test-bind port 5000. If it is already in use, show a native error dialog via `webview` and exit.
   - Poll `http://127.0.0.1:5000/` until the server is alive.
   - Open pywebview:
     ```python
     webview.create_window(
         'SafeLock',
         'http://127.0.0.1:5000/',
         width=1440, height=900, min_size=(1280, 800),
         text_select=False
     )
     webview.start()
     ```

**Verification Gate:**

```powershell
.venv\Scripts\python.exe launcher.py
```

A native window appears. After unlocking, the logs and command queue live-load. Closing the window exits the Python process.

---

## Phase 3 — Tray icon, close-to-tray, and Windows auto-start

**Goal:** The app behaves like an appliance: survives window close, lives in the tray, and can start automatically with Windows.

**Steps:**

1. Add a **pystray** tray icon in `launcher.py`:
   - Menu: **Open SafeLock** (recreates the window) and **Quit** (stops the server and exits).
   - Window close event (`on_closing` / `window.events.closed`) → hide the window instead of quitting.
2. Isolate the WebView2 profile so password/localStorage data lives with SafeLock's own data (not the shared `%APPDATA%\pywebview`):
   ```python
   webview.start(storage_path=os.path.join(data_dir(), 'webview'))
   ```
3. Add a `--minimized` command-line flag:
   - Starts the server and tray icon only.
   - Does not open the window on launch.
   - Used by the Windows auto-start entry.
4. Add `winreg` helpers in `launcher.py`:
   - Add/remove `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\SafeLock` pointing to `"<exe>" --minimized`.
   - Expose this as a tray menu toggle: **Start with Windows**.
5. Add a tray menu toggle **Firewall: Allow LAN access**:
   - On = run `netsh advfirewall firewall add rule name="SafeLock" dir=in action=allow protocol=TCP localport=5000` (elevated, UAC prompt).
   - Off = run `netsh advfirewall firewall delete rule name="SafeLock"`.
   - Note: turning it off does **not** break the local dashboard (localhost always works) — it only blocks the ESP32/other LAN devices.

**Verification Gate:**

1. Run `launcher.py`, close the window — the process stays alive.
2. Verify `http://127.0.0.1:5000/api/device/status` still responds from another browser.
3. Click **Quit** from the tray — the process exits.
4. Toggle **Start with Windows** — `reg query HKCU\...\Run /v SafeLock` shows/removes the entry.
5. Toggle **Firewall: Allow LAN access** off then on — `netsh advfirewall firewall show rule name=SafeLock` confirms removal/creation.
6. Test `--minimized`:
   ```powershell
   .venv\Scripts\python.exe launcher.py --minimized
   ```
   No window opens, but tray icon appears and the API responds.

---

## Phase 4 — PyInstaller frozen build

**Goal:** Produce a single `SafeLock.exe` that runs standalone.

**Steps:**

1. Create `desktop/safelock.spec`:
   - Onefile exe, `console=False`.
   - Name `SafeLock`.
   - Icon `desktop/icon.ico`.
   - Bundle `static/` via `datas=[('static', 'static')]`.
   - Include hidden imports PyInstaller reliably misses (app uses flask-sock + pywebview on pythonnet/CLR, not flask-socketio):
     ```python
     hiddenimports=['flask_sock', 'simple_websocket', 'clr']
     ```
   - If pywebview's native `WebView2` assemblies are not picked up, fall back to `--collect-all webview` and `--collect-all pythonnet`.
2. Build:
   ```powershell
   .venv\Scripts\pyinstaller.exe desktop/safelock.spec --noconfirm --clean
   ```
3. Test the exe from a neutral directory (not the project folder).

**Verification Gate:**

1. Run `dist\SafeLock.exe`.
2. Confirm `%LOCALAPPDATA%\SafeLock\` is created and contains `safe.db` + `images\`.
3. Dashboard loads in the native window.
4. `http://<LAN-IP>:5000/api/device/status` is reachable from another device on the network.
5. `python verify_backend.py` still passes **17/17** (this confirms the source changes did not break dev mode).

**Notes from the build:**

- All relative paths in `safelock.spec` resolve **from the spec file's directory** (`desktop/`): entry script is `../launcher.py`, static bundle is `('../static', 'static')`, tray icon is `('icon.png', 'desktop')`, exe icon is `icon.ico`.
- The `clr` (pythonnet) and `webview` PyInstaller hooks are picked up automatically — no `--collect-all` fallback needed.
- Installed `simple_websocket` ships no `lib/` static assets, so the classic `simple_websocket.lib` missing-module failure does not apply to this build.
- `pycparser.lextab/yacctab` and `pysqlite2/MySQLdb/psycopg2` warnings in `warn-safelock.txt` are benign (unused DB drivers).
- Verified: `dist\SafeLock.exe` boots the server in ~2s, creates `%LOCALAPPDATA%\SafeLock\` (`safe.db`, `images\`, `webview\`), serves the dashboard, and responds on the LAN IP.

---

## Phase 5 — Inno Setup installer + build pipeline

**Goal:** A polished Windows installer wizard and a one-command rebuild.

**Steps:**

1. Create `desktop/installer.iss`:
   - Install to `{autopf}\SafeLock`.
   - Start Menu and Desktop shortcuts.
   - Uninstaller entry.
   - "Launch SafeLock" finish checkbox.
   - Optional "Start with Windows" task (HKCU Run key: `SafeLock.exe --minimized`).
   - Add a Windows Firewall rule on install:
     ```pascal
     [Run]
     Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=""SafeLock"" dir=in action=allow protocol=TCP localport=5000"; ...
     ```
   - Remove the rule on uninstall:
     ```pascal
     [UninstallRun]
     Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""SafeLock"""; ...
     ```
   - Users can also remove the rule later **without uninstalling**: tray toggle (Phase 3) or manually in an admin PowerShell: `netsh advfirewall firewall delete rule name="SafeLock"`. This only affects LAN access — the local dashboard keeps working.
2. Create `build.ps1` (one-command pipeline) — note `iscc` is not on PATH here, so use the full path:
   ```powershell
   cd frontend
   npm run build
   cd ..
   Remove-Item -Recurse -Force static\assets
   Copy-Item -Recurse -Force frontend\dist\* static\
   .venv\Scripts\pyinstaller.exe desktop/safelock.spec --noconfirm --clean
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" desktop\installer.iss
   Write-Host "Output: desktop\Output\SafeLockSetup.exe"
   ```
3. Run the build script.

**Verification Gate:**

1. Run `desktop\Output\SafeLockSetup.exe` on this machine.
2. Install to the default path.
3. Check:
   - Start Menu and Desktop shortcuts launch the app.
   - `netsh advfirewall firewall show rule name=SafeLock` shows the firewall rule.
   - Auto-start entry is created (if checked during install).
4. Reboot the machine (or just run the auto-start command manually).
5. Uninstall via Windows Settings → Apps → SafeLock.
   - Program, shortcuts, firewall rule, and (optionally) `%LOCALAPPDATA%\SafeLock` data are removed. Note: deleting SafeLock data also wipes logs **and** resets the admin password (next launch re-seeds the prebuilt default).

**Notes from the build:**

- Verified by user on this machine (2026-08-04): install to default path, launched, then uninstall — all shortcuts, the firewall rule, the HKCU Run entry, the uninstall registry entry, and `C:\Program Files\SafeLock` were removed cleanly.
- The full pipeline (`desktop\build.ps1`) is one command from anywhere: frontend → `static/` → PyInstaller → ISCC → `desktop\Output\SafeLockSetup.exe`. Build time ~2 min.
- `installer.iss` treats the firewall rule idempotently (netsh delete/add wrapped with `|| exit /b 0` so re-runs don't abort).
- User data (`%LOCALAPPDATA%\SafeLock\`) is intentionally **not** deleted on uninstall to preserve logs; the installer only removes the program, shortcuts, the HKCU Run entry, and the firewall rule.
- ISCC warns about `PrivilegesRequired=admin` + per-user (HKCU) usage — expected: we write the per-user auto-start key on purpose.
- AppId GUID: `EFC62E4B-9C9D-4E9B-9FA4-587ABAFC5B47`.

---

## Phase 6 — End-to-end hardware validation + docs

**Goal:** Prove the real ESP32 system works with the packaged app, and document the packaging workflow.

**Steps:**

1. With the packaged app running:
   - Power the ESP32: verify the WebSocket handshake at `/ws` and the dashboard shows device status as **online**.
   - Trigger a command (e.g., **UNLOCK**) from the dashboard → relay clicks → status becomes **DONE**.
   - Press a keypad button on the physical safe → a camera frame appears in the dashboard within seconds.
2. Update `AGENTS.md`:
   - Mention `launcher.py`, `desktop/`, `build.ps1`.
   - Document runtime data location (`%LOCALAPPDATA%\SafeLock`).
   - Document the build command: `desktop\build.ps1`.
   - Note that the Windows installer adds the firewall rule.

**Verification Gate:**

Full hardware loop works through the installed desktop app: keypad touch → camera image → log entry → dashboard display.

---

## Known Risks

| Risk | Mitigation |
|---|---|
| **Antivirus false positives** on unsigned PyInstaller exes | One-click "allow on device"; code signing is out of scope for this project. |
| **Firewall rule needs admin** | Inno Setup installer requests elevation and adds the rule silently. Portable/dev runs show the Windows prompt on first run (click "Allow"). The rule can be removed later via uninstall, the Phase 3 tray toggle, or `netsh advfirewall firewall delete rule name="SafeLock"`. |
| **WebView2 runtime required** | Built into Windows 10 (recent updates) and Windows 11; very old Win10 builds need the Edge WebView2 Runtime installed — pywebview cannot render without it. |
| **Static host IP still required** | The ESP32 firmware hardcodes the Flask machine's IP. Packaging does not change the network setup requirement. The router must still assign the desktop a static IP. |
| **Port 5000 in use** | `launcher.py` detects this before starting and shows a clear error dialog. |

---

## Quick Reference

- **Run in dev:** `app.py`
- **Run native window in dev:** `launcher.py`
- **Run headless (auto-start mode):** `SafeLock.exe --minimized`
- **Build everything:** `desktop\build.ps1`
- **User data:** `%LOCALAPPDATA%\SafeLock\`
- **Install output:** `desktop\Output\SafeLockSetup.exe`
- **Admin password:** prebuilt in `config.py` (`DEFAULT_ADMIN_PASSWORD`); handed to the admin by hand, no setup screen, no reset
- **Forgot password (operator only):** delete the `admin_auth` row (or `safe.db`) and restart — the prebuilt default is re-seeded
