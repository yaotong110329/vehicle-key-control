param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$url = "http://localhost:$Port/"
$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [byte[]]$Body,
        [string]$ContentType = 'text/plain; charset=utf-8'
    )

    $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

try {
    try {
        $listener.Start()
    }
    catch {
        $existingApp = $false
        try {
            $probe = (& curl.exe -sS --max-time 2 $url 2>$null) -join "`n"
            $existingApp = $LASTEXITCODE -eq 0 -and $probe -match 'src="\./app\.js"'
        }
        catch {
            $existingApp = $false
        }

        if ($existingApp) {
            Write-Host "Vehicle Key Control is already running: $url" -ForegroundColor Yellow
            if (-not $NoBrowser) {
                try { Start-Process -FilePath 'msedge.exe' -ArgumentList $url } catch { Start-Process $url }
            }
            exit 0
        }
        throw
    }

    Write-Host "Vehicle Key Control is running: $url" -ForegroundColor Green
    Write-Host 'Keep this window open. Press Ctrl+C to stop.' -ForegroundColor DarkGray

    if (-not $NoBrowser) {
        try {
            Start-Process -FilePath 'msedge.exe' -ArgumentList $url
        }
        catch {
            Start-Process $url
        }
    }

    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($null -ne ($line = $reader.ReadLine()) -and $line -ne '') { }

            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2 -or $parts[0] -ne 'GET') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
                Send-Response -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -Body $body
                continue
            }

            $requestPath = $parts[1].Split('?')[0]
            if ($requestPath -eq '/') { $requestPath = '/index.html' }
            $relativePath = [System.Uri]::UnescapeDataString($requestPath).TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relativePath))
            $allowedPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

            if (-not $filePath.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                Send-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Body $body
                continue
            }

            $body = [System.IO.File]::ReadAllBytes($filePath)
            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
            Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $body -ContentType $contentType
        }
        catch {
            Write-Warning $_.Exception.Message
        }
        finally {
            $client.Dispose()
        }
    }
}
finally {
    $listener.Stop()
}
