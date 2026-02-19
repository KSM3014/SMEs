# SME Investor Platform — Deploy Script
# Usage: powershell -File scripts/deploy.ps1 [-TunnelUrl <url>] [-SkipTunnel] [-SkipBuild]
#
# This script:
# 1. Starts/restarts the Cloudflare quick tunnel (or uses provided URL)
# 2. Builds the frontend (only needed for code changes, NOT for URL changes)
# 3. Updates config.json with tunnel URL
# 4. Deploys to Cloudflare Pages (sme-investor.pages.dev)

param(
    [string]$TunnelUrl = "",
    [switch]$SkipTunnel,
    [switch]$SkipBuild,
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $env:USERPROFILE ".cloudflared\tunnel.log"
$ConfigFile = Join-Path $ProjectRoot "frontend\public\config.json"
$DistConfig = Join-Path $ProjectRoot "frontend\dist\config.json"

Write-Host "=== SME Investor Deploy ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

# --- Step 1: Backend Tunnel ---
if (-not $SkipTunnel -and -not $TunnelUrl) {
    Write-Host "`n[1/4] Starting Cloudflare Tunnel..." -ForegroundColor Yellow

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
    Write-Host "`n[1/4] Using provided tunnel URL: $TunnelUrl" -ForegroundColor Yellow
} else {
    Write-Host "`n[1/4] Skipping tunnel setup" -ForegroundColor DarkGray
}

if ($BackendOnly) {
    Write-Host "`n=== Backend tunnel ready ===" -ForegroundColor Green
    Write-Host "Tunnel: $TunnelUrl"
    exit 0
}

# --- Step 2: Build Frontend (skip if no code changes) ---
if (-not $SkipBuild) {
    Write-Host "`n[2/4] Building frontend..." -ForegroundColor Yellow
    Push-Location (Join-Path $ProjectRoot "frontend")
    try {
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Frontend build failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Build OK" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/4] Skipping frontend build (no code changes)" -ForegroundColor DarkGray
}

# --- Step 3: Update config.json with tunnel URL ---
if ($TunnelUrl) {
    Write-Host "`n[3/4] Updating config.json..." -ForegroundColor Yellow
    $configContent = @{ apiUrl = $TunnelUrl } | ConvertTo-Json
    # Update source
    Set-Content -Path $ConfigFile -Value $configContent -Encoding UTF8
    # Update dist (for deploy)
    if (Test-Path (Split-Path $DistConfig)) {
        Set-Content -Path $DistConfig -Value $configContent -Encoding UTF8
    }
    Write-Host "  apiUrl = $TunnelUrl" -ForegroundColor Green
} else {
    Write-Host "`n[3/4] No tunnel URL — config.json unchanged" -ForegroundColor DarkGray
}

# --- Step 4: Deploy to Cloudflare Pages ---
Write-Host "`n[4/4] Deploying to Cloudflare Pages..." -ForegroundColor Yellow
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
Write-Host "Next time tunnel dies, just run:"
Write-Host "  powershell -File $($MyInvocation.MyCommand.Path)" -ForegroundColor Cyan
