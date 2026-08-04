"""SafeLock desktop launcher — Flask server + native window + system tray.

Modes:
  launcher.py                 Start server, open dashboard window, minimize to tray on close.
  launcher.py --minimized     Start server and tray only (used by Windows auto-start).
"""
import ctypes
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import winreg

import pystray
import webview
from PIL import Image

from app import create_app

HOST = "0.0.0.0"
PORT = 5000
URL = f"http://127.0.0.1:{PORT}/"
APP_NAME = "SafeLock"

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
FIREWALL_RULE_NAME = "SafeLock"
FIREWALL_PORT = "5000"

quit_requested = False


def resource_path(rel):
    """Resolve a bundled resource path (works for dev and PyInstaller)."""
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", os.path.abspath(os.path.dirname(__file__)))
    else:
        base = os.path.abspath(os.path.dirname(__file__))
    return os.path.join(base, rel)


def port_available(port: int) -> bool:
    """Return True if nothing is actively listening on the port.

    Uses a connect probe rather than a bind: an active listener (including
    a stale SafeLock server) accepts the connection, while leftover TIME_WAIT
    entries from a just-exited process refuse it. A bind test is unreliable
    on Windows — SO_REUSEADDR lets it succeed next to a live listener
    (false positive), and without it a TIME_WAIT backlog blocks restarts
    (false negative).
    """
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1.0):
            return False  # something accepted → port is in use
    except (ConnectionRefusedError, TimeoutError, OSError):
        return True


def wait_for_server(url: str, timeout: float = 30.0) -> bool:
    """Poll until the Flask server responds or timeout elapses."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(0.15)
    return False


def run_flask():
    app = create_app()
    app.run(
        host=HOST,
        port=PORT,
        threaded=True,
        debug=False,
        use_reloader=False,
    )


def show_error_page(title: str, message: str):
    """Show a simple native error window."""
    window = webview.create_window(
        APP_NAME,
        html=(
            "<html><body style='font-family:system-ui;background:#0b0f19;"
            "color:#f3f4f6;display:flex;align-items:center;justify-content:center;"
            "height:100vh;margin:0'>"
            "<div style='text-align:center;max-width:28rem;padding:2rem'>"
            f"<h1 style='color:#ef4444;margin-bottom:0.75rem'>{title}</h1>"
            f"<p>{message}</p>"
            "</div></body></html>"
        ),
        width=480,
        height=280,
    )
    webview.start(storage_path=os.path.join(data_dir(), "webview"))
    return window


def data_dir():
    """Persistent runtime data dir (%LOCALAPPDATA%\\SafeLock when frozen)."""
    if getattr(sys, "frozen", False):
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    else:
        base = os.path.abspath(os.path.dirname(__file__))
    target = os.path.join(base, APP_NAME)
    os.makedirs(target, exist_ok=True)
    return target


def autostart_command() -> str:
    """Command stored in HKCU Run to launch at logon."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --minimized'
    return f'"{sys.executable}" "{os.path.abspath(__file__)}" --minimized'


def autostart_enabled() -> bool:
    """Return True if the SafeLock auto-start entry exists."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, APP_NAME)
            return "--minimized" in value
    except FileNotFoundError:
        return False


def set_autostart(enabled: bool):
    """Add or remove the HKCU Run entry for SafeLock."""
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, autostart_command())
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass


def firewall_rule_exists() -> bool:
    """Return True if the SafeLock inbound firewall rule exists."""
    try:
        result = subprocess.run(
            ["netsh", "advfirewall", "firewall", "show", "rule", f"name={FIREWALL_RULE_NAME}"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return "Rule Name" in result.stdout
    except OSError:
        return False


def run_elevated(args: list) -> int:
    """Launch a command elevated via UAC prompt. Returns process handle or 0."""
    params = " ".join(args)
    return int(ctypes.windll.shell32.ShellExecuteW(None, "runas", "netsh", params, None, 1))


def set_firewall_rule(enable: bool):
    """Add or delete the inbound TCP :5000 firewall rule (elevated)."""
    if enable:
        args = [
            "advfirewall",
            "firewall",
            "add",
            "rule",
            f"name={FIREWALL_RULE_NAME}",
            "dir=in",
            "action=allow",
            "protocol=TCP",
            f"localport={FIREWALL_PORT}",
        ]
    else:
        args = ["advfirewall", "firewall", "delete", "rule", f"name={FIREWALL_RULE_NAME}"]
    run_elevated(args)


def on_closing(window):
    """Intercept window close: hide to tray instead of quitting."""
    global quit_requested
    if quit_requested:
        return
    window.hide()
    return False  # cancel the close


def open_window(minimized: bool = False):
    """Create the dashboard window (hidden when starting minimized)."""
    window = webview.create_window(
        APP_NAME,
        URL,
        width=1440,
        height=900,
        min_size=(1280, 800),
        text_select=False,
        hidden=minimized,
    )
    window.events.closing += on_closing
    return window


def tray_open(window):
    window.show()


def tray_toggle_autostart(icon, item):
    set_autostart(not autostart_enabled())


def tray_toggle_firewall(icon, item):
    set_firewall_rule(not firewall_rule_exists())


def tray_quit(window):
    global quit_requested
    quit_requested = True
    window.destroy()


def build_tray_menu(window):
    return pystray.Menu(
        pystray.MenuItem("Open SafeLock", lambda icon, item: tray_open(window), default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(
            "Start with Windows",
            tray_toggle_autostart,
            checked=lambda item: autostart_enabled(),
        ),
        pystray.MenuItem(
            "Firewall: Allow LAN access",
            tray_toggle_firewall,
            checked=lambda item: firewall_rule_exists(),
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", lambda icon, item: tray_quit(window)),
    )


def tray_icon(window) -> pystray.Icon:
    image = Image.open(resource_path(os.path.join("desktop", "icon.png"))).resize((64, 64), Image.LANCZOS)
    return pystray.Icon(APP_NAME, image, APP_NAME, menu=build_tray_menu(window))


def start_tray(window) -> pystray.Icon:
    icon = tray_icon(window)
    thread = threading.Thread(target=icon.run, name="tray", daemon=True)
    thread.start()
    return icon


def main():
    minimized = "--minimized" in sys.argv[1:]

    if not port_available(PORT):
        show_error_page(
            "Port in use",
            f"SafeLock cannot start because port {PORT} is already in use. "
            "Close the other instance and try again.",
        )
        sys.exit(1)

    server_thread = threading.Thread(target=run_flask, name="flask-server", daemon=True)
    server_thread.start()

    if not wait_for_server(URL):
        show_error_page(
            "Startup failed",
            "The SafeLock server did not become ready in time.",
        )
        sys.exit(1)

    window = open_window(minimized=minimized)
    start_tray(window)
    webview.start(storage_path=os.path.join(data_dir(), "webview"))


if __name__ == "__main__":
    main()
