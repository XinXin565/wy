param(
  [Parameter(Mandatory=$true)][string]$InputFile
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = (Resolve-Path -LiteralPath $InputFile).Path
$target = Join-Path $root 'storage.sqlite'
if (!(Test-Path $source)) { throw "备份不存在: $InputFile" }
if ((Resolve-Path $source).Path -eq (Resolve-Path $target).Path) { throw '恢复源不能与当前数据库相同' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $target -Destination (Join-Path $root "storage.sqlite.before-restore-$stamp") -Force
Copy-Item -LiteralPath $source -Destination $target -Force
Write-Output "RESTORE OK: $target"
