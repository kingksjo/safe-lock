; SafeLock installer — Inno Setup 6
; Compile: ISCC.exe installer.iss  (or via build.ps1)

#define AppName "SafeLock"
#define AppVersion "1.1.0"
#define AppPublisher "SafeLock"
#define AppExeName "SafeLock.exe"

[Setup]
AppId={{EFC62E4B-9C9D-4E9B-9FA4-587ABAFC5B47}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=SafeLockSetup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
VersionInfoVersion={#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
MinVersion=0,10.0

[Tasks]
Name: "autostart"; Description: "Start SafeLock with Windows (runs minimized in the tray)"; GroupDescription: "Additional options:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "..\dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; Auto-start with Windows (minimized), instead of full auto-start
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SafeLock"; ValueData: """{app}\{#AppExeName}"" --minimized"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Add the LAN-access firewall rule. Installer is elevated, so this runs silently.
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=""SafeLock"" dir=in action=allow protocol=TCP localport=5000 || exit /b 0"; Flags: runhidden; StatusMsg: "Adding Windows Firewall rule for LAN access..."
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Remove the firewall rule (leave user data in %LOCALAPPDATA% untouched).
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=""SafeLock"" || exit /b 0"; Flags: runhidden; RunOnceId: "delete_firewall"