param(
  [string]$Output = ""
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Output)) { $Output = Join-Path $root ("backups\license-{0}.sqlite" -f (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$dir = Split-Path -Parent $Output
if ([string]::IsNullOrWhiteSpace($dir)) { $dir = $root; $Output = Join-Path $root $Output }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$source = Join-Path $root 'storage.sqlite'
if (!(Test-Path $source)) { throw "数据库不存在: $source" }
Copy-Item -LiteralPath $source -Destination $Output -Force
Write-Output "BACKUP OK: $Output"
