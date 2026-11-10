@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title YouTube Live Recorder

set "PORT=3100"
set "FORCE_BUILD="
if /I "%~1"=="--build" set "FORCE_BUILD=1"

where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js tidak ditemukan. Install Node.js LTS dulu, lalu jalankan lagi.
  pause
  exit /b 1
)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [info] Aplikasi sudah berjalan di port %PORT%.
  echo   Lokal    : http://localhost:%PORT%
  start "" http://localhost:%PORT%
  exit /b 0
)

if not exist "node_modules" (
  echo [setup] Menginstall dependensi npm...
  call npm install
  if errorlevel 1 (
    echo [error] npm install gagal.
    pause
    exit /b 1
  )
)

if not exist "bin\yt-dlp.exe" (
  echo [warn] bin\yt-dlp.exe tidak ditemukan. Rekaman tidak akan berjalan.
  echo        Letakkan yt-dlp.exe di folder bin\.
)
where ffmpeg >nul 2>nul
if errorlevel 1 echo [warn] ffmpeg tidak ada di PATH. Remux ke mp4 akan gagal.

net session >nul 2>&1
if not errorlevel 1 (
  netsh advfirewall firewall show rule name="YT Live Recorder" >nul 2>nul
  if errorlevel 1 netsh advfirewall firewall add rule name="YT Live Recorder" dir=in action=allow protocol=TCP localport=%PORT% >nul
) else (
  echo [info] Supaya bisa dibuka dari perangkat lain, jalankan sekali di Administrator:
  echo        netsh advfirewall firewall add rule name="YT Live Recorder" dir=in action=allow protocol=TCP localport=%PORT%
)

echo.
echo   Lokal    : http://localhost:%PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do (
    if not "%%b"=="127.0.0.1" echo   Jaringan : http://%%b:%PORT%
  )
)
echo.
echo   Catatan: aplikasi ini tanpa login. Gunakan hanya di jaringan tepercaya.
echo.

if not exist ".next\BUILD_ID" set "FORCE_BUILD=1"
if defined FORCE_BUILD (
  echo [build] Menyiapkan build produksi...
  call npm run build
  if errorlevel 1 (
    echo [error] Build gagal.
    pause
    exit /b 1
  )
)

echo [start] Menjalankan web + worker. Tekan Ctrl+C untuk berhenti.
call npm run start
echo.
echo [stop] Aplikasi berhenti.
pause
