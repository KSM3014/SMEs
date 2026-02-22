# Production Startup Script — launches backend + tunnel watchdog
# Usage: powershell -File scripts/start-production.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== SME Investor Service — Production Startup ===" -ForegroundColor Cyan

# 1. Check if backend is already running
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] Backend already running on port 3000" -ForegroundColor Green
} catch {
    Write-Host "Starting backend server..."
    Start-Process -FilePath "node" `
        -ArgumentList "server.js" `
        -WorkingDirectory (Join-Path $ProjectRoot "backend") `
        -WindowStyle Minimized
    Write-Host "Waiting for backend to start..."
    Start-Sleep -Seconds 5
    try {
        Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop | Out-Null
        Write-Host "[OK] Backend started" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Backend may not be ready yet" -ForegroundColor Yellow
    }
}

# 2. Start tunnel watchdog (background)
$watchdogScript = Join-Path $ProjectRoot "scripts\tunnel-watchdog.ps1"
Write-Host "Starting tunnel watchdog..."
Start-Process powershell -ArgumentList "-File `"$watchdogScript`"" -WindowStyle Minimized
Write-Host "[OK] Tunnel watchdog started (background)" -ForegroundColor Green

Write-Host "`n=== All services started ===" -ForegroundColor Green
Write-Host "Backend:  http://localhost:3000"
Write-Host "Frontend: http://localhost:3001 (dev) or https://sme-investor.pages.dev (prod)"
Write-Host "Watchdog: Monitoring tunnel health every 30s"
Write-Host "Logs:     ~\.cloudflared\watchdog.log"
