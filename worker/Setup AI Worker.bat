@echo off
chcp 65001 >nul
title SmartClass - AI Worker setup
cd /d "%~dp0"
echo ============================================================
echo   SmartClass - put the AI key behind a Cloudflare Worker
echo ============================================================
echo.
where npx >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. The download page opens now:
  echo install the LTS version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
echo STEP 1 of 3 - Sign in to Cloudflare
echo   A browser page opens. Sign in or create a FREE account, then click Allow.
echo.
call npx --yes wrangler@4 login
if errorlevel 1 goto fail
echo.
echo STEP 2 of 3 - Upload the Worker (no key inside it)
call npx --yes wrangler@4 deploy > deploy-log.txt 2>&1
type deploy-log.txt
findstr /r /c:"https://.*workers\.dev" deploy-log.txt > worker-address.txt
for /f "tokens=*" %%a in (worker-address.txt) do set ADDR=%%a
if "%ADDR%"=="" goto fail
echo.
echo STEP 3 of 3 - Your Gemini key
echo   The Google AI Studio page opens: Create API key, copy it.
echo   Then come back here, paste it (right-click) and press Enter.
echo   It is not shown on screen and is stored only at Cloudflare, encrypted.
start "" https://aistudio.google.com/apikey
call npx --yes wrangler@4 secret put GEMINI_KEY
if errorlevel 1 goto fail
echo.
echo ============================================================
echo   DONE. Your Worker address (also copied to the clipboard):
echo   %ADDR%
echo   Send this address to Claude.
echo ============================================================
echo %ADDR%| clip
pause
exit /b 0
:fail
echo.
echo Something did not work. Take a screenshot of this window and send it to Claude.
pause
exit /b 1
