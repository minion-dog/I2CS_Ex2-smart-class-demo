@echo off
rem Double-click to try SmartClass.
rem With Python installed: starts the local server, so phones on the same Wi-Fi can join too.
rem Without Python: a demo on this PC only (PowerShell, nothing to install).
chcp 65001 >nul
cd /d "%~dp0"

py -3 --version >nul 2>nul
if %errorlevel%==0 goto lan
python --version >nul 2>nul
if %errorlevel%==0 goto lan

echo Python was not found, so this is the demo for THIS PC only (phones cannot join).
echo For phones: install "Python 3.12" from the Microsoft Store and double-click this file again.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0web\serve.ps1"
goto :eof

:lan
call "%~dp0Start LAN Server.bat"
