# One-command setup for GraphCompose AI Template Flow.
# Thin wrapper — the real logic lives in scripts/setup.mjs (cross-platform).
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
node scripts/setup.mjs @args
exit $LASTEXITCODE
