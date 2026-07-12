@echo off
cd /d "%~dp0"
set PATH=C:\Users\quan\.workbuddy\binaries\node\versions\22.22.2;%PATH%
echo Starting diary backend + web app...
start /b cmd /c "node server/index.mjs"
timeout /t 2 /nobreak >nul
start /b cmd /c "npm run dev -- --port 5188"
timeout /t 4 /nobreak >nul
start http://localhost:5188
echo Diary app running at http://localhost:5188 (backend on 5189)
echo Close this window to stop.
pause >nul
