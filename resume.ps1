# Resume the latest opencode session for this project.
# Reads the session id from SESSION.md (repo root).

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SessionFile = Join-Path $RepoRoot "SESSION.md"

if (-not (Test-Path $SessionFile)) {
    Write-Host "SESSION.md not found in repo root." -ForegroundColor Red
    exit 1
}

$content = Get-Content $SessionFile -Raw
# Extract session id from lines like "opencode -s ses_..."
$match = [regex]::Match($content, 'opencode -s (\S+)')
if (-not $match.Success) {
    Write-Host "No session id found in SESSION.md" -ForegroundColor Red
    exit 1
}

$SessionId = $match.Groups[1].Value
Write-Host "Resuming session: $SessionId" -ForegroundColor Cyan
Set-Location $RepoRoot
& opencode -s $SessionId
