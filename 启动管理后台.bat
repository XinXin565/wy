@echo off
setlocal
cd /d "%~dp0"
set "PHPRC="
set "PHP_BIN=%CD%\php-runtime\php.exe"
set "PHP_EXT=%CD%\php-runtime\ext"

if not exist "%PHP_BIN%" (
  echo PHP runtime not found: %PHP_BIN%
  pause
  exit /b 1
)

echo.
echo Card Key MVP admin is starting...
echo Open: http://127.0.0.1:8080/admin
echo Keep this window open while testing. Press Ctrl+C to stop.
echo.
"%PHP_BIN%" -c "%CD%\php-runtime\php.ini" -d "extension_dir=%PHP_EXT%" -S 127.0.0.1:8080 index.php
pause
