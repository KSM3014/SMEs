# Cloudflared Tunnel Watchdog — auto-restarts tunnel on failure
# Usage: powershell -File scripts/tunnel-watchdog.ps1
#
# Features:
# - Monitors cloudflared process health every 30 seconds
# - Auto-restarts if process dies
# - Auto-restarts if health check to backend fails
# - Updates config.json + redeploys to Pages on new URL
# - Logs to ~/.cloudflared/watchdog.log
#
# To run as background task:
#   Start-Process powershell -ArgumentList "-File scripts/tunnel-watchdog.ps1" -WindowStyle Hidden

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile = Join-Path $env:USERPROFILE ".cloudflared\tunnel.log"
$WatchdogLog = Join-Path $env:USERPROFILE ".cloudflared\watchdog.log"
$ConfigFile = Join-Path $ProjectRoot "frontend\public\config.json"
$DistConfig = Join-Path $ProjectRoot "frontend\dist\config.json"
$CheckInterval = 30  # seconds between health checks
$MaxRestarts = 50    # max restarts before giving up

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $WatchdogLog -Value $line -ErrorAction SilentlyContinue
}

function Get-TunnelUrl {
    if (-not (Test-Path $LogFile)) { return $null }
    $match = Select-String -Path $LogFile -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com" | Select-Object -Last 1
    if ($match) {
        return ($match.Line | Select-String -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com").Matches[0].Value
    }
    return $null
}

function Start-Tunnel {
    $cfDir = Join-Path $env:USERPROFILE ".cloudflared"
    if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir -Force | Out-Null }

    # Clear old log to get fresh URL
    if (Test-Path $LogFile) { Remove-Item $LogFile -Force }

    Start-Process -FilePath "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
        -ArgumentList "tunnel", "--url", "http://localhost:3000" `
        -RedirectStandardError $LogFile `
        -WindowStyle Hidden

    Write-Log "Started cloudflared process"

    # Wait for URL
    $maxWait = 30
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $url = Get-TunnelUrl
        if ($url) {
            Write-Log "Tunnel URL: $url"
            return $url
        }
    }

    Write-Log "ERROR: Could not get tunnel URL within ${maxWait}s"
    return $null
}

function Update-Config($tunnelUrl) {
    if (-not $tunnelUrl) { return }
    $configContent = @{ apiUrl = $tunnelUrl } | ConvertTo-Json
    Set-Content -Path $ConfigFile -Value $configContent -Encoding UTF8
    if (Test-Path (Split-Path $DistConfig)) {
        Set-Content -Path $DistConfig -Value $configContent -Encoding UTF8
    }
    Write-Log "Updated config.json with $tunnelUrl"
}

function Deploy-Pages {
    $distPath = Join-Path $ProjectRoot "frontend\dist"
    if (-not (Test-Path $distPath)) {
        Write-Log "WARNING: dist/ not found, skipping Pages deploy"
        return
    }
    try {
        $result = wrangler pages deploy $distPath --project-name sme-investor --commit-dirty=true 2>&1
        $success = $result | Select-String "Deployment complete|Success"
        if ($success) {
            Write-Log "Pages deploy successful"
        } else {
            Write-Log "Pages deploy may have failed: $result"
        }
    } catch {
        Write-Log "Pages deploy error: $_"
    }
}

function Test-TunnelHealth($tunnelUrl) {
    if (-not $tunnelUrl) { return $false }
    try {
        $response = Invoke-WebRequest -Uri "$tunnelUrl/health" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# ===== Main Watchdog Loop =====

Write-Log "=== Tunnel Watchdog Started ==="
Write-Log "Check interval: ${CheckInterval}s, Max restarts: $MaxRestarts"

$restarts = 0
$currentUrl = $null

# Initial start
$proc = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($proc) {
    $currentUrl = Get-TunnelUrl
    Write-Log "Existing tunnel found (PID $($proc.Id)), URL: $currentUrl"
} else {
    $currentUrl = Start-Tunnel
    if ($currentUrl) {
        Update-Config $currentUrl
        Deploy-Pages
        $restarts++
    }
}

while ($restarts -lt $MaxRestarts) {
    Start-Sleep -Seconds $CheckInterval

    $proc = Get-Process cloudflared -ErrorAction SilentlyContinue

    if (-not $proc) {
        Write-Log "WARNING: cloudflared process died! Restarting... (restart #$($restarts+1))"
        $currentUrl = Start-Tunnel
        if ($currentUrl) {
            Update-Config $currentUrl
            Deploy-Pages
        }
        $restarts++
        continue
    }

    # Process alive — check health via tunnel
    if ($currentUrl) {
        $healthy = Test-TunnelHealth $currentUrl
        if (-not $healthy) {
            # Double-check: maybe backend is down, not tunnel
            try {
                $localHealth = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
                if ($localHealth.StatusCode -eq 200) {
                    # Backend OK but tunnel unhealthy → restart tunnel
                    Write-Log "WARNING: Tunnel unhealthy but backend OK. Restarting tunnel..."
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 3
                    $currentUrl = Start-Tunnel
                    if ($currentUrl) {
                        Update-Config $currentUrl
                        Deploy-Pages
                    }
                    $restarts++
                } else {
                    Write-Log "Backend also unhealthy. Waiting..."
                }
            } catch {
                Write-Log "Backend not reachable at localhost:3000. Waiting..."
            }
        }
    }
}

Write-Log "Max restarts ($MaxRestarts) reached. Watchdog stopping."
