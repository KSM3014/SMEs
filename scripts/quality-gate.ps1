param(
  [switch]$Full,
  [switch]$WithProposal,
  [int]$ProposalMaxItems = 8,
  [bool]$WithSummary = $true,
  [int]$SummaryTopItems = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stateDir = Join-Path $repoRoot '.quality-gate'
$stateFile = Join-Path $stateDir 'state.json'
$reportDir = Join-Path $repoRoot 'output\quality-gate'

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

function To-RelPath {
  param([string]$Path)
  if ([System.IO.Path].GetMethods() | Where-Object { $_.Name -eq 'GetRelativePath' }) {
    return [System.IO.Path]::GetRelativePath($repoRoot, $Path).Replace('\', '/')
  }
  $normalizedRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
  $normalizedPath = [System.IO.Path]::GetFullPath($Path)
  if ($normalizedPath.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $normalizedPath.Substring($normalizedRoot.Length).Replace('\', '/')
  }
  return $normalizedPath.Replace('\', '/')
}

function Invoke-Capture {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & cmd /c $Command 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
    Pop-Location
  }

  $lines = @()
  if ($null -ne $raw) {
    $lines = @($raw | ForEach-Object { $_.ToString() })
  }

  return [PSCustomObject]@{
    command  = $Command
    cwd      = $WorkingDirectory
    exitCode = $exitCode
    output   = ($lines -join "`n")
  }
}

function Read-PackageScripts {
  param([string]$PackageJsonPath)

  $pkg = Get-Content -Path $PackageJsonPath -Raw | ConvertFrom-Json
  if (-not $pkg.PSObject.Properties.Name.Contains('scripts')) {
    return @()
  }
  return @($pkg.scripts.PSObject.Properties.Name)
}

function Build-CommandEvidence {
  param([object]$Result)
  $preview = ''
  if ($Result.output) {
    $preview = ($Result.output -split "`n" | Select-Object -First 8) -join ' | '
  }
  return "cmd=`$ $($Result.command)` (cwd: $(To-RelPath $Result.cwd), exit=$($Result.exitCode)) | $preview"
}

function Invoke-GitFileList {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    return @(& git -c core.safecrlf=false -C $repoRoot @Arguments 2>$null | Where-Object { $_ })
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
}

function Get-SeverityWeight {
  param([string]$Severity)
  switch ($Severity) {
    'Critical' { return 4 }
    'High' { return 3 }
    'Medium' { return 2 }
    default { return 1 }
  }
}

function Get-ProposalPriority {
  param([string]$Severity)
  switch ($Severity) {
    'Critical' { return 'P0' }
    'High' { return 'P1' }
    'Medium' { return 'P2' }
    default { return 'P3' }
  }
}

$now = Get-Date
$nowUtc = $now.ToUniversalTime()
$state = $null
if (Test-Path $stateFile) {
  try {
    $state = Get-Content -Path $stateFile -Raw | ConvertFrom-Json
  } catch {
    $state = $null
  }
}

$isFirstRun = $null -eq $state
$mode = if ($Full -or $isFirstRun) { 'FULL' } else { 'INCREMENTAL' }
$lastRunUtc = $null
if ($state -and $state.PSObject.Properties.Name.Contains('lastRunUtc')) {
  $lastRunUtc = [DateTime]::Parse($state.lastRunUtc).ToUniversalTime()
}

$gitRoot = Join-Path $repoRoot '.git'
$hasGit = Test-Path $gitRoot

$staged = @()
$unstaged = @()
$untracked = @()
$recentCommit = @()
$changedScope = @()

if ($hasGit) {
  $staged = @(Invoke-GitFileList -Arguments @('diff', '--cached', '--name-only'))
  $unstaged = @(Invoke-GitFileList -Arguments @('diff', '--name-only'))
  $untracked = @(Invoke-GitFileList -Arguments @('ls-files', '--others', '--exclude-standard'))
  $recentCommit = @(Invoke-GitFileList -Arguments @('log', '-1', '--name-only', '--pretty=format:'))
  $changedScope = @($staged + $unstaged + $untracked + $recentCommit | Sort-Object -Unique)
} else {
  $baseline = if ($mode -eq 'FULL' -or -not $lastRunUtc) { $now.AddDays(-2) } else { $lastRunUtc.ToLocalTime() }
  $changedScope = @(
    Get-ChildItem -Path (Join-Path $repoRoot 'backend'), (Join-Path $repoRoot 'frontend'), (Join-Path $repoRoot 'database') -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.LastWriteTime -ge $baseline -and
        $_.FullName -notmatch '\\node_modules\\|\\dist\\|UsersAdministratorpuppeteer_|\\output\\quality-gate\\' -and
        $_.Extension -notin @('.png', '.jpg', '.jpeg', '.log', '.sqlite3', '.html')
      } |
      ForEach-Object { To-RelPath $_.FullName } |
      Sort-Object -Unique
  )
}

$priorityRegex = '(?i)(auth|admin|payment|billing|checkout|config|server|database|schema|build|\.env|api|route|middleware|package\.json|vite\.config|jest\.config)'
$priorityFiles = @($changedScope | Where-Object { $_ -match $priorityRegex } | Sort-Object -Unique)

$issues = New-Object System.Collections.Generic.List[object]

function Add-Issue {
  param(
    [string]$Severity,
    [string]$Category,
    [string]$FileLine,
    [string]$Evidence,
    [string]$Fix,
    [string]$Exploit = ''
  )

  $issues.Add([PSCustomObject]@{
      Severity = $Severity
      Category = $Category
      FileLine = $FileLine
      Evidence = $Evidence
      Fix      = $Fix
      Exploit  = $Exploit
    })
}

# Compatibility checks (Node/JS)
$packageJsons = @(
  Get-ChildItem -Path $repoRoot -Recurse -File -Filter 'package.json' |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    Sort-Object FullName
)

$commandResults = New-Object System.Collections.Generic.List[object]

foreach ($pkg in $packageJsons) {
  $pkgDir = $pkg.Directory.FullName
  $scripts = Read-PackageScripts -PackageJsonPath $pkg.FullName
  foreach ($name in @('lint', 'typecheck', 'test', 'build')) {
    if ($scripts -contains $name) {
      $res = Invoke-Capture -Command "npm run $name" -WorkingDirectory $pkgDir
      $commandResults.Add($res)
    } else {
      $commandResults.Add([PSCustomObject]@{
          command  = "npm run $name"
          cwd      = $pkgDir
          exitCode = -1
          output   = "SKIP: missing script '$name'"
        })
    }
  }

  $audit = Invoke-Capture -Command 'npm audit --omit=dev --audit-level=moderate' -WorkingDirectory $pkgDir
  $commandResults.Add($audit)
}

# Security checks
$adminAuthPath = Join-Path $repoRoot 'backend\middleware\adminAuth.js'
if (Test-Path $adminAuthPath) {
  $adminQueryMatch = Select-String -Path $adminAuthPath -Pattern 'req\.query\.adminKey' -CaseSensitive:$false
  if ($adminQueryMatch) {
    Add-Issue -Severity 'High' -Category 'Security' -FileLine "$(To-RelPath $adminAuthPath):$($adminQueryMatch[0].LineNumber)" `
      -Evidence 'admin credential accepted in query string (URL/log exposure)' `
      -Fix 'Accept only header-based credential, remove query fallback, rotate ADMIN_API_KEY.' `
      -Exploit 'Leaked URLs or proxy logs can expose admin key and enable privileged API access.'
  }
}

$dbConfigPath = Join-Path $repoRoot 'backend\config\database.js'
if (Test-Path $dbConfigPath) {
  $sslMatch = Select-String -Path $dbConfigPath -Pattern 'rejectUnauthorized:\s*false'
  if ($sslMatch) {
    Add-Issue -Severity 'High' -Category 'Security' -FileLine "$(To-RelPath $dbConfigPath):$($sslMatch[0].LineNumber)" `
      -Evidence 'production DB SSL allows untrusted certificate (rejectUnauthorized: false)' `
      -Fix 'Set rejectUnauthorized: true and pin CA/cert chain via environment-managed trust store.' `
      -Exploit 'MITM on DB traffic can intercept credentials and data.'
  }
}

$orchestratorPath = Join-Path $repoRoot 'backend\services\apiOrchestrator.js'
if (Test-Path $orchestratorPath) {
  $loopLine = Select-String -Path $orchestratorPath -Pattern 'for \(const api of TWO_STEP_APIS\)'
  $awaitLine = Select-String -Path $orchestratorPath -Pattern 'const data = await this\.httpGet'
  if ($loopLine -and $awaitLine) {
    Add-Issue -Severity 'Medium' -Category 'Efficiency' -FileLine "$(To-RelPath $orchestratorPath):$($loopLine[0].LineNumber)" `
      -Evidence '2-step API calls execute sequentially and increase latency as API list grows.' `
      -Fix 'Reuse executeWithConcurrencyLimit() for TWO_STEP_APIS with conservative concurrency (e.g., 2-3).' `
      -Exploit 'High request volume can amplify response time and degrade API SLA.'
  }
}

# Readability check
$longFiles = @(
  Get-ChildItem -Path (Join-Path $repoRoot 'backend'), (Join-Path $repoRoot 'frontend') -Recurse -File -Include *.js,*.jsx |
    Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\scripts\\|UsersAdministratorpuppeteer_' } |
    ForEach-Object {
      $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
      [PSCustomObject]@{ Path = $_.FullName; Lines = $lineCount }
    } |
    Where-Object { $_.Lines -ge 600 }
)
foreach ($f in $longFiles) {
  Add-Issue -Severity 'Low' -Category 'Readability' -FileLine "$(To-RelPath $f.Path):1" `
    -Evidence "single file length = $($f.Lines) lines" `
    -Fix 'Split by responsibility (query orchestration, response mapping, helpers) and keep modules focused.'
}

# Command-derived findings
foreach ($res in $commandResults) {
  $relDir = To-RelPath $res.cwd
  if ($res.command -eq 'npm audit --omit=dev --audit-level=moderate' -and $res.output -match 'high severity vulnerabilities') {
    $countLine = ($res.output -split "`n" | Where-Object { $_ -match 'high severity vulnerabilities' } | Select-Object -First 1).Trim()
    Add-Issue -Severity 'High' -Category 'Security' -FileLine "$relDir/package-lock.json:1" `
      -Evidence ("dependency audit reported: " + $countLine + " | " + (Build-CommandEvidence $res)) `
      -Fix 'Upgrade or isolate vulnerable transitive deps (puppeteer/ws/tar-fs); remove runtime dependency where not required.'
  }

  if ($res.command -eq 'npm run lint' -and $res.exitCode -ne 0) {
    Add-Issue -Severity 'Medium' -Category 'Compatibility' -FileLine "$relDir/package.json:1" `
      -Evidence (Build-CommandEvidence $res) `
      -Fix 'Clear lint warnings/errors to satisfy CI gate.'
  }

  if ($res.command -eq 'npm run build' -and $res.output -match 'Some chunks are larger than 500 kB') {
    Add-Issue -Severity 'Medium' -Category 'Efficiency' -FileLine "$relDir/vite.config.js:1" `
      -Evidence (Build-CommandEvidence $res) `
      -Fix 'Apply route-level lazy loading and manual chunking for heavy UI/chart modules.'
  }
}

$frontendPkgPath = Join-Path $repoRoot 'frontend\package.json'
if (Test-Path $frontendPkgPath) {
  $frontendScripts = Read-PackageScripts -PackageJsonPath $frontendPkgPath
  if (-not ($frontendScripts -contains 'test')) {
    Add-Issue -Severity 'Medium' -Category 'Effectiveness' -FileLine 'frontend/package.json:1' `
      -Evidence 'frontend has no test script; regression coverage cannot be verified for UI behavior.' `
      -Fix 'Add minimal smoke/component tests and wire npm test in CI.'
  }
}

$blocking = @($issues | Where-Object { $_.Severity -in @('Critical', 'High') })
$overall = if ($blocking.Count -gt 0) { 'FAIL' } elseif ($issues.Count -gt 0) { 'WARN' } else { 'PASS' }

$reportLines = New-Object System.Collections.Generic.List[string]
$reportLines.Add('[30-minute Quality Gate Report]')
$reportLines.Add("- Run time: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))")
$reportLines.Add("- Mode: $mode")
if ($hasGit) {
  $reportLines.Add('- Scope source: git staged/unstaged/untracked/last commit')
} else {
  $reportLines.Add('- Scope source: no .git found; fallback to modified files since last run')
}
$reportLines.Add("- Overall: $overall")
$reportLines.Add('- Blocking issues:')
if ($blocking.Count -eq 0) {
  $reportLines.Add('  - none')
} else {
  foreach ($b in $blocking) {
    $reportLines.Add("  - [$($b.Severity)] $($b.FileLine) :: $($b.Evidence)")
  }
}

$reportLines.Add('- Scope details:')
if ($hasGit) {
  $reportLines.Add("  - staged: $(@($staged).Count)")
  $reportLines.Add("  - unstaged: $(@($unstaged).Count)")
  $reportLines.Add("  - untracked: $(@($untracked).Count)")
  $reportLines.Add("  - last commit files: $(@($recentCommit).Count)")
} else {
  $reportLines.Add('  - staged/unstaged/untracked/last commit: unavailable (no .git metadata)')
  $reportLines.Add("  - modified files in scope: $(@($changedScope).Count)")
}

$reportLines.Add("- Priority files: $(@($priorityFiles).Count)")
foreach ($f in ($priorityFiles | Select-Object -First 20)) {
  $reportLines.Add("  - $f")
}

$reportLines.Add('- Category results:')
$reportLines.Add("  - Efficiency: $(@($issues | Where-Object { $_.Category -eq 'Efficiency' }).Count) issue(s)")
$reportLines.Add("  - Effectiveness: $(@($issues | Where-Object { $_.Category -eq 'Effectiveness' }).Count) issue(s)")
$reportLines.Add("  - Readability: $(@($issues | Where-Object { $_.Category -eq 'Readability' }).Count) issue(s)")
$reportLines.Add("  - Compatibility: $(@($issues | Where-Object { $_.Category -eq 'Compatibility' }).Count) issue(s)")
$reportLines.Add("  - Security: $(@($issues | Where-Object { $_.Category -eq 'Security' }).Count) issue(s)")

$reportLines.Add('- Issues:')
if ($issues.Count -eq 0) {
  $reportLines.Add('  - none')
} else {
  $idx = 1
  foreach ($i in $issues) {
    $reportLines.Add("  $idx. [$($i.Severity)] [$($i.Category)] $($i.FileLine)")
    $reportLines.Add("     Evidence: $($i.Evidence)")
    if ($i.Exploit) {
      $reportLines.Add("     Exploit scenario: $($i.Exploit)")
    }
    $reportLines.Add("     Minimal fix: $($i.Fix)")
    $idx++
  }
}

$reportLines.Add('- Top 3 immediate actions:')
$top3 = @($issues | Sort-Object @{ Expression = { Get-SeverityWeight $_.Severity }; Descending = $true } | Select-Object -First 3)
if ($top3.Count -eq 0) {
  $reportLines.Add('  - keep current gate; no immediate issue.')
} else {
  foreach ($t in $top3) {
    $reportLines.Add("  - [$($t.Severity)] $($t.Fix)")
  }
}

$reportLines.Add('- Pre-next-run checklist:')
$reportLines.Add('  - Fix blocking security findings and rerun.')
$reportLines.Add('  - Ensure lint/test/build scripts are green for touched packages.')
$reportLines.Add('  - Keep evidence logs attached to the next report.')

$reportBody = $reportLines -join "`n"

$reportPath = Join-Path $reportDir ("quality-gate-{0}.md" -f $now.ToString('yyyyMMdd-HHmmss'))
Set-Content -Path $reportPath -Value $reportBody -Encoding UTF8

$proposalRelPath = $null
if ($WithProposal) {
  $maxItems = [Math]::Max(1, $ProposalMaxItems)
  $sortedIssues = @(
    $issues |
      Sort-Object `
        @{ Expression = { Get-SeverityWeight $_.Severity }; Descending = $true }, `
        @{ Expression = { $_.Category } }, `
        @{ Expression = { $_.FileLine } }
  )

  $proposalLines = New-Object System.Collections.Generic.List[string]
  $proposalLines.Add('[30-minute Fix Proposal]')
  $proposalLines.Add("- Run time: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))")
  $proposalLines.Add("- Source report: $(To-RelPath $reportPath)")
  $proposalLines.Add("- Goal: close blocking findings first, then stabilize lint/test/build gate.")
  $proposalLines.Add('- Priority buckets:')
  $proposalLines.Add("  - P0 (Critical): $(@($issues | Where-Object { $_.Severity -eq 'Critical' }).Count)")
  $proposalLines.Add("  - P1 (High): $(@($issues | Where-Object { $_.Severity -eq 'High' }).Count)")
  $proposalLines.Add("  - P2 (Medium): $(@($issues | Where-Object { $_.Severity -eq 'Medium' }).Count)")
  $proposalLines.Add("  - P3 (Low): $(@($issues | Where-Object { $_.Severity -eq 'Low' }).Count)")

  $proposalLines.Add('- Proposed tasks:')
  if ($sortedIssues.Count -eq 0) {
    $proposalLines.Add('  - no action required; keep current baseline and monitor next run.')
  } else {
    $taskIdx = 1
    foreach ($issue in ($sortedIssues | Select-Object -First $maxItems)) {
      $priority = Get-ProposalPriority $issue.Severity
      $proposalLines.Add("  $taskIdx. [$priority][$($issue.Severity)] $($issue.FileLine)")
      $proposalLines.Add("     Why: $($issue.Evidence)")
      if ($issue.Exploit) {
        $proposalLines.Add("     Risk: $($issue.Exploit)")
      }
      $proposalLines.Add("     Proposal: $($issue.Fix)")
      $taskIdx++
    }
  }

  $proposalLines.Add('- Verification after apply:')
  $proposalLines.Add('  - backend: npm audit --omit=dev --audit-level=moderate')
  $proposalLines.Add('  - frontend: npm run lint')
  $proposalLines.Add('  - touched package: npm run test (if present), npm run build')

  $proposalBody = $proposalLines -join "`n"
  $proposalPath = Join-Path $reportDir ("proposal-{0}.md" -f $now.ToString('yyyyMMdd-HHmmss'))
  Set-Content -Path $proposalPath -Value $proposalBody -Encoding UTF8
  $proposalRelPath = To-RelPath $proposalPath
}

$summaryRelPath = $null
$latestSummaryRelPath = $null
if ($WithSummary) {
  $summaryMax = [Math]::Max(1, $SummaryTopItems)
  $sortedIssuesForSummary = @(
    $issues |
      Sort-Object `
        @{ Expression = { Get-SeverityWeight $_.Severity }; Descending = $true }, `
        @{ Expression = { $_.Category } }, `
        @{ Expression = { $_.FileLine } }
  )

  $summaryLines = New-Object System.Collections.Generic.List[string]
  $summaryLines.Add('[Quality Gate Quick Summary]')
  $summaryLines.Add("- Run time: $($now.ToString('yyyy-MM-dd HH:mm:ss zzz'))")
  $summaryLines.Add("- Overall: $overall")
  $summaryLines.Add("- Blocking: $($blocking.Count)")
  $summaryLines.Add("- Total issues: $($issues.Count)")
  $summaryLines.Add("- Report: $(To-RelPath $reportPath)")
  if ($proposalRelPath) {
    $summaryLines.Add("- Proposal: $proposalRelPath")
  }
  $summaryLines.Add('')
  $summaryLines.Add('## 문제파악')
  if ($sortedIssuesForSummary.Count -eq 0) {
    $summaryLines.Add('- 이슈 없음')
  } else {
    foreach ($issue in ($sortedIssuesForSummary | Select-Object -First $summaryMax)) {
      $summaryLines.Add("- [$($issue.Severity)][$($issue.Category)] $($issue.FileLine) :: $($issue.Evidence)")
    }
  }
  $summaryLines.Add('')
  $summaryLines.Add('## Suggestion')
  $fixes = @(
    $sortedIssuesForSummary |
      ForEach-Object { $_.Fix } |
      Select-Object -Unique |
      Select-Object -First $summaryMax
  )
  if ($fixes.Count -eq 0) {
    $summaryLines.Add('- 유지')
  } else {
    foreach ($fix in $fixes) {
      $summaryLines.Add("- $fix")
    }
  }

  $summaryBody = $summaryLines -join "`n"
  $summaryPath = Join-Path $reportDir ("summary-{0}.md" -f $now.ToString('yyyyMMdd-HHmmss'))
  $latestSummaryPath = Join-Path $reportDir 'latest-summary.md'
  Set-Content -Path $summaryPath -Value $summaryBody -Encoding UTF8
  Set-Content -Path $latestSummaryPath -Value $summaryBody -Encoding UTF8

  $feedPath = Join-Path $reportDir 'summary-feed.log'
  $feedLine = "[{0}] overall={1} blocking={2} issues={3} report={4} proposal={5} summary={6}" -f `
    $now.ToString('yyyy-MM-dd HH:mm:ss zzz'), $overall, $blocking.Count, $issues.Count, `
    (To-RelPath $reportPath), `
    ($(if ($proposalRelPath) { $proposalRelPath } else { 'n/a' })), `
    (To-RelPath $summaryPath)
  Add-Content -Path $feedPath -Value $feedLine -Encoding UTF8

  $summaryRelPath = To-RelPath $summaryPath
  $latestSummaryRelPath = To-RelPath $latestSummaryPath
}

$newState = [PSCustomObject]@{
  lastRunUtc = $nowUtc.ToString('o')
  mode       = $mode
  reportPath = To-RelPath $reportPath
  proposalPath = $proposalRelPath
  summaryPath = $summaryRelPath
  latestSummaryPath = $latestSummaryRelPath
}
$newState | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Write-Output $reportBody
Write-Output ""
Write-Output "Report saved: $(To-RelPath $reportPath)"
if ($WithProposal) {
  Write-Output "Proposal saved: $proposalRelPath"
}
if ($WithSummary) {
  Write-Output "Summary saved: $summaryRelPath"
  Write-Output "Latest summary: $latestSummaryRelPath"
}
