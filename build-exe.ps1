$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
Set-Location $projectRoot

function Require-Command([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name is not installed. $hint"
    }
}

Require-Command "cargo" "Install Rust stable-msvc first."
Require-Command "rustc" "Install Rust stable-msvc first."
Require-Command "npm" "Install Node.js LTS first."

$tauriCli = Join-Path $projectRoot "node_modules\@tauri-apps\cli"
if (-not (Test-Path -LiteralPath $tauriCli)) {
    throw "Local Tauri CLI is missing. Run npm install --offline in an environment with a prepared npm cache; this script never downloads packages."
}

Write-Host "Building current-user, offline WebView2, maximized NSIS EXE..." -ForegroundColor Cyan
npm run tauri:build

$bundlePath = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis"
Write-Host "Complete. Installer directory: $bundlePath" -ForegroundColor Green
