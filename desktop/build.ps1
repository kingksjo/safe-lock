# SafeLock build pipeline: frontend -> static -> exe -> installer
# Run from anywhere:  .\desktop\build.ps1
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ISCC = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

if (-not (Test-Path $ISCC)) { throw "ISCC.exe not found at $ISCC - install Inno Setup 6" }
if (-not (Test-Path "$ProjectRoot\.venv\Scripts\pyinstaller.exe")) { throw "pyinstaller not found in .venv" }

Push-Location $ProjectRoot
try {
    Write-Host "== 1/4 Frontend build =="
    Push-Location frontend
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }

    Write-Host "== 2/4 Copy frontend dist to static/ =="
    Remove-Item -Recurse -Force static\assets -ErrorAction SilentlyContinue
    Copy-Item -Recurse -Force frontend\dist\* static\

    Write-Host "== 3/4 PyInstaller: dist\SafeLock.exe =="
    & "$ProjectRoot\.venv\Scripts\pyinstaller.exe" "desktop/safelock.spec" --noconfirm --clean
    if ($LASTEXITCODE -ne 0) { throw "pyinstaller failed" }

    Write-Host "== 4/4 Inno Setup: desktop\Output\SafeLockSetup.exe =="
    & $ISCC "desktop\installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "ISCC failed" }

    Write-Host ""
    Write-Host "Output: desktop\Output\SafeLockSetup.exe"
} finally {
    Pop-Location
}