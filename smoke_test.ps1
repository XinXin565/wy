$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  & .\php-runtime\php.exe -c .\php-runtime\php.ini -d extension_dir=.\php-runtime\ext -l .\index.php
  & .\php-runtime\php.exe -c .\php-runtime\php.ini -d extension_dir=.\php-runtime\ext -l .\bootstrap.php
  node --check .\admin_fix.js
  $login = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/admin/login' -UseBasicParsing
  if ($login.StatusCode -ne 200) { throw "admin login page status: $($login.StatusCode)" }
  $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/healthz' -UseBasicParsing
  if ($health.StatusCode -ne 200) { throw "health status: $($health.StatusCode)" }
  Write-Host 'SMOKE PASS'
} finally { Pop-Location }
