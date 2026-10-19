# GraphCompose AI Flow — first-run setup on Windows.
# Makes sure Node.js 20+ exists, then hands over to bootstrap.mjs with the same
# arguments. Node is only installed when -InstallMissing / --install-missing is given.
$ErrorActionPreference = 'Stop'
$install = $args -contains '--install-missing' -or $args -contains '-InstallMissing' -or $args -contains '--yes'
$forward = @($args | Where-Object { $_ -ne '-InstallMissing' })
if ($args -contains '-InstallMissing') { $forward += '--install-missing' }

function Get-NodeMajor {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return 0 }
  return [int]((& node -p 'process.versions.node.split(".")[0]') 2>$null)
}

if ((Get-NodeMajor) -lt 20) {
  if (-not $install) {
    Write-Host 'Node.js 20+ is required. Install it, or re-run with --install-missing:'
    Write-Host '    winget install -e --id OpenJS.NodeJS.LTS'
    exit 1
  }
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if ((Get-NodeMajor) -lt 20) { Write-Host 'Node.js did not install; open a new terminal and retry.'; exit 1 }
}

& node (Join-Path $PSScriptRoot 'bootstrap.mjs') @forward
exit $LASTEXITCODE
