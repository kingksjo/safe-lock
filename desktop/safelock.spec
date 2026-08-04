# -*- mode: python ; coding: utf-8 -*-
# SafeLock onefile build spec — entry point launcher.py
# (server + native pywebview window + pystray tray)

from PyInstaller.utils.hooks import collect_data_files

datas = [
    ('../static', 'static'),                   # built React dashboard
    ('icon.png', 'desktop'),                   # tray icon (resource_path)
] + collect_data_files('simple_websocket')     # safe: no lib assets in this version

hiddenimports = [
    'flask_sock',
    'simple_websocket',
    'clr',                                     # pywebview -> pythonnet/.NET WebView2
]

a = Analysis(
    ['../launcher.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='SafeLock',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
