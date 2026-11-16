@echo off
rem Double-click to run SmartClass on your Wi-Fi: this PC = lecturer, phones = students.
rem Needs Python 3 (free, Microsoft Store: "Python 3.12"). No packages to install.
chcp 65001 >nul
cd /d "%~dp0"

py -3 --version >nul 2>nul
if %errorlevel%==0 (
    py -3 server\server.py
    goto end
)
python --version >nul 2>nul
if %errorlevel%==0 (
    python server\server.py
    goto end
)

echo.
echo Python was not found.
echo 1. Open the Microsoft Store, search "Python 3.12", press Get.
echo 2. Double-click this file again.
echo.
start ms-windows-store://pdp/?productid=9NCVDN91XZQP

:end
echo.
pause
