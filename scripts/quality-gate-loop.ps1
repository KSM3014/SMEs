param(
  [int]$IntervalMinutes = 30,
  [bool]$WithProposal = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$gateScript = Join-Path $PSScriptRoot 'quality-gate.ps1'
if (-not (Test-Path $gateScript)) {
  throw "Missing script: $gateScript"
}

Write-Output "[QualityGate] Starting loop. Interval=${IntervalMinutes}m, Proposal=$WithProposal"
Write-Output "[QualityGate] First run starts now."

while ($true) {
  $started = Get-Date
  Write-Output ""
  Write-Output ("[QualityGate] Run started: {0}" -f $started.ToString('yyyy-MM-dd HH:mm:ss zzz'))

  try {
    $gateArgs = @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $gateScript
    )
    if ($WithProposal) {
      $gateArgs += '-WithProposal'
    }

    & powershell @gateArgs
  } catch {
    Write-Output ("[QualityGate] Run failed: {0}" -f $_.Exception.Message)
  }

  $finished = Get-Date
  $waitSeconds = [Math]::Max(0, ($IntervalMinutes * 60) - [int]($finished - $started).TotalSeconds)
  Write-Output ("[QualityGate] Run finished: {0}" -f $finished.ToString('yyyy-MM-dd HH:mm:ss zzz'))
  Write-Output ("[QualityGate] Sleeping {0} seconds..." -f $waitSeconds)
  Start-Sleep -Seconds $waitSeconds
}
