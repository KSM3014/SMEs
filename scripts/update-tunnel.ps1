# Quick tunnel restart + URL update — NO frontend rebuild needed
# Usage: powershell -File scripts/update-tunnel.ps1
#
# What it does:
# 1. Restarts cloudflared quick tunnel
# 2. Updates config.json with new URL
# 3. Re-uploads just config.json to Cloudflare Pages (~3 seconds)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $env:USERPROFILE ".cloudflared\tunnel.log"
$ConfigFile = Join-Path $ProjectRoot "frontend\public\config.json"
$DistConfig = Join-Path $ProjectRoot "frontend\dist\config.json"

Write-Host "=== Quick Tunnel Update ===" -ForegroundColor Cyan

# 1. Kill existing and restart tunnel
$existing = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping old tunnel (PID $($existing.Id))..."
    Stop-Process -Id $existing.Id -Force
    Start-Sleep -Seconds 2
}

$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir -Force | Out-Null }

Start-Process -FilePath "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
    -ArgumentList "tunnel", "--url", "http://localhost:3000" `
    -RedirectStandardError $LogFile `
    -WindowStyle Hidden

Write-Host "Waiting for tunnel URL..."
$maxWait = 30
$elapsed = 0
$TunnelUrl = ""
while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 2
    $elapsed += 2
    if (Test-Path $LogFile) {
        $match = Select-String -Path $LogFile -Pattern "https://.*\.trycloudflare\.com" | Select-Object -First 1
        if ($match) {
            $TunnelUrl = ($match.Line | Select-String -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com").Matches[0].Value
            break
        }
    }
}

if (-not $TunnelUrl) {
    Write-Host "ERROR: Could not get tunnel URL" -ForegroundColor Red
    exit 1
}

Write-Host "New tunnel: $TunnelUrl" -ForegroundColor Green

# 2. Update config.json
$configContent = @{ apiUrl = $TunnelUrl } | ConvertTo-Json
Set-Content -Path $ConfigFile -Value $configContent -Encoding UTF8
if (Test-Path (Split-Path $DistConfig)) {
    Set-Content -Path $DistConfig -Value $configContent -Encoding UTF8
}

# 3. Re-deploy dist to Pages (uses existing build, just updates config.json)
Write-Host "Deploying to Pages..."
$distPath = Join-Path $ProjectRoot "frontend\dist"
wrangler pages deploy $distPath --project-name sme-investor --commit-dirty=true 2>&1 | Select-String "Deployment complete|Success"

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Frontend: https://sme-investor.pages.dev"
Write-Host "Backend:  $TunnelUrl"
