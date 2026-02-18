# SME Investor Platform — Deploy Script
# Usage: powershell -File scripts/deploy.ps1 [-TunnelUrl <url>] [-SkipTunnel] [-SkipFrontend]
#
# This script:
# 1. Starts/restarts the Cloudflare quick tunnel (or uses provided URL)
# 2. Builds the frontend with VITE_API_URL pointing to the tunnel
# 3. Deploys to Cloudflare Pages (sme-investor.pages.dev)

param(
    [string]$TunnelUrl = "",
    [switch]$SkipTunnel,
    [switch]$SkipFrontend,
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $env:USERPROFILE ".cloudflared\tunnel.log"

Write-Host "=== SME Investor Deploy ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

# --- Step 1: Backend Tunnel ---
if (-not $SkipTunnel -and -not $TunnelUrl) {
    Write-Host "`n[1/3] Starting Cloudflare Tunnel..." -ForegroundColor Yellow

    # Kill existing cloudflared
    $existing = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  Stopping existing cloudflared (PID $($existing.Id))..."
        Stop-Process -Id $existing.Id -Force
        Start-Sleep -Seconds 2
    }

    # Ensure directory exists
    $cfDir = Join-Path $env:USERPROFILE ".cloudflared"
    if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir -Force | Out-Null }

    # Start tunnel with stderr redirected to log
    Start-Process -FilePath "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
        -ArgumentList "tunnel", "--url", "http://localhost:3000" `
        -RedirectStandardError $LogFile `
        -WindowStyle Hidden

    # Wait for tunnel URL
    Write-Host "  Waiting for tunnel URL..."
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
        Write-Host "  ERROR: Could not get tunnel URL after ${maxWait}s" -ForegroundColor Red
        exit 1
    }

    Write-Host "  Tunnel URL: $TunnelUrl" -ForegroundColor Green
} elseif ($TunnelUrl) {
    Write-Host "`n[1/3] Using provided tunnel URL: $TunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "`n[1/3] Skipping tunnel setup" -ForegroundColor DarkGray
}

if ($BackendOnly) {
    Write-Host "`n=== Backend tunnel ready ===" -ForegroundColor Green
    Write-Host "Tunnel: $TunnelUrl"
    exit 0
}

# --- Step 2: Build Frontend ---
if (-not $SkipFrontend) {
    Write-Host "`n[2/3] Building frontend with API URL..." -ForegroundColor Yellow
    Write-Host "  VITE_API_URL=$TunnelUrl"

    $env:VITE_API_URL = $TunnelUrl
    Push-Location (Join-Path $ProjectRoot "frontend")
    try {
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Frontend build failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Build OK (dist/)" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/3] Skipping frontend build" -ForegroundColor DarkGray
}

# --- Step 3: Deploy to Cloudflare Pages ---
Write-Host "`n[3/3] Deploying to Cloudflare Pages..." -ForegroundColor Yellow
$distPath = Join-Path $ProjectRoot "frontend\dist"
wrangler pages deploy $distPath --project-name sme-investor --commit-dirty=true 2>&1 | ForEach-Object {
    if ($_ -match "https://") {
        Write-Host "  $_" -ForegroundColor Green
    } else {
        Write-Host "  $_"
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Pages deploy failed" -ForegroundColor Red
    exit 1
}

# --- Summary ---
Write-Host "`n=== Deploy Complete ===" -ForegroundColor Green
Write-Host "Frontend: https://sme-investor.pages.dev"
if ($TunnelUrl) {
    Write-Host "Backend:  $TunnelUrl"
}
Write-Host ""
Write-Host "Test: curl $TunnelUrl/health"
Write-Host "Open: https://sme-investor.pages.dev"
