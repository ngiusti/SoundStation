@echo off
rem Starts Void Haulers SFX Lab in your browser. Needs Node.js 20 or newer (https://nodejs.org).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies, one time only... & call npm install || (echo Install failed. & pause & exit /b 1))
echo Starting SFX Lab. Close this window to stop it.
call npm start
pause
