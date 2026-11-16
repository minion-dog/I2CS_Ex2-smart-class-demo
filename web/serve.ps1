# =====================================================================
#  serve.ps1 - a tiny local web server for the demo (no Python needed)
# =====================================================================
# Serves this folder at http://localhost:8000 using .NET's HttpListener,
# which every Windows 10/11 has. "localhost" works without admin rights.
# Stop it by closing the window (or Ctrl+C).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
}

# Try port 8000, and the next ones if it is taken (or blocked).
$listener = $null
$lastError = ''
foreach ($p in 8000..8020) {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    try {
        $l.Start()
        $listener = $l
        $port = $p
        break
    } catch {
        $lastError = $_.Exception.Message
        $l.Close()
    }
}
if ($null -eq $listener) {
    Write-Host 'Could not start the demo server on ports 8000-8020.' -ForegroundColor Red
    Write-Host "Windows said: $lastError" -ForegroundColor Yellow
    Write-Host 'Send a screenshot of this window.'
    Read-Host 'Press Enter to close'
    exit 1
}
Write-Host "SmartClass demo is running at http://localhost:$port/?demo=1" -ForegroundColor Green
Write-Host 'Keep this window open. Close it to stop.'
Start-Process "http://localhost:$port/?demo=1"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
        $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
        if ($path -eq '/') { $path = '/index.html' }
        $file = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
        # never serve anything outside this folder
        if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) {
            $res.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        } else {
            $ext = [System.IO.Path]::GetExtension($file).ToLower()
            $type = $types[$ext]
            if (-not $type) { $type = 'application/octet-stream' }
            $res.ContentType = $type
            $res.Headers.Add('Cache-Control', 'no-cache')
            $bytes = [System.IO.File]::ReadAllBytes($file)
        }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        $res.StatusCode = 500
    } finally {
        $res.Close()
    }
}
