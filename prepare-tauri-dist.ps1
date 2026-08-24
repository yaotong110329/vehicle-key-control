$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$allowedPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $distRoot.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "dist path is outside the project directory."
}

if (Test-Path -LiteralPath $distRoot) {
    Get-ChildItem -LiteralPath $distRoot -Force | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $distRoot | Out-Null
}

$runtimeFiles = @(
    "index.html",
    "styles.css",
    "app.js",
    "storage.js",
    "components.js",
    "modal.js",
    "history.js",
    "settings.js",
    "utils.js",
    "bulk-import.js"
)
foreach ($file in $runtimeFiles) {
    $source = Join-Path $projectRoot $file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing frontend runtime file: $file"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $distRoot $file)
}

$assetSource = Join-Path $projectRoot "assets\default-logo.png"
$assetRoot = Join-Path $distRoot "assets"
if (-not (Test-Path -LiteralPath $assetSource -PathType Leaf)) {
    throw "Missing default logo asset: assets/default-logo.png"
}
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
Copy-Item -LiteralPath $assetSource -Destination (Join-Path $assetRoot "default-logo.png")

Write-Host "Prepared Tauri dist: $distRoot" -ForegroundColor Green
