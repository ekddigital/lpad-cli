# lpad — EKD Digital Launchpad CLI installer for Windows (PowerShell)
# One-line install (run in PowerShell as current user — no admin required):
#   irm https://raw.githubusercontent.com/ekddigital/lpad-cli/main/install.ps1 | iex

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Repo    = if ($env:LPAD_CLI_REPO) { $env:LPAD_CLI_REPO } else { "ekddigital/lpad-cli" }
$RawBase = "https://raw.githubusercontent.com/$Repo/main"
$InstallDir = if ($env:LPAD_INSTALL_DIR) { $env:LPAD_INSTALL_DIR } else {
    Join-Path $HOME ".lpad\bin"
}

function Write-Step($msg) { Write-Host "  -> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK: $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  ERR: $msg" -ForegroundColor Red; exit 1 }

# ── Require Node.js ──────────────────────────────────────────────────────────
try { $nodeVersion = (node --version 2>&1) } catch { $nodeVersion = $null }
if (-not $nodeVersion -or -not ($nodeVersion -match "^v(\d+)")) {
    Write-Err "Node.js >= 20 is required. Download from https://nodejs.org/"
}
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 20) {
    Write-Err "Node.js >= 20 required (found $nodeVersion). Download from https://nodejs.org/"
}

Write-Host ""
Write-Host "Installing lpad (EKD Digital Launchpad CLI)..." -ForegroundColor White

# ── Download lpad.js ─────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$jsUrl   = "$RawBase/bin/lpad.js"
$jsPath  = Join-Path $InstallDir "lpad.js"
$cmdPath = Join-Path $InstallDir "lpad.cmd"

Write-Step "Downloading $jsUrl"
try {
    Invoke-WebRequest -Uri $jsUrl -OutFile $jsPath -UseBasicParsing
} catch {
    Write-Err "Failed to download lpad.js: $_"
}
Write-Ok "Downloaded $jsPath"

# ── Write lpad.cmd wrapper ───────────────────────────────────────────────────
# .cmd wrapper so 'lpad' works in cmd.exe, PowerShell, and Windows Terminal
@"
@echo off
node "%~dp0lpad.js" %*
"@ | Set-Content -Encoding ASCII -Path $cmdPath
Write-Ok "Created $cmdPath"

# ── Add InstallDir to user PATH (permanent) ───────────────────────────────────
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$InstallDir*") {
    [System.Environment]::SetEnvironmentVariable(
        "PATH",
        "$InstallDir;$userPath",
        "User"
    )
    Write-Ok "Added $InstallDir to your PATH (User scope)"
    Write-Host ""
    Write-Host "  NOTE: Restart your terminal (or open a new one) for PATH to take effect." -ForegroundColor Yellow
} else {
    Write-Ok "$InstallDir already in PATH"
}

Write-Host ""
Write-Host "Done! Run: lpad --help" -ForegroundColor Green
Write-Host ""
