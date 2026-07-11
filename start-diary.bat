@echo off
cd /d "%~dp0"
set PATH=C:\Users\quan\.workbuddy\binaries\node\versions\22.22.2;%PATH%
echo Starting diary web app...
start /b cmd /c "npm run dev -- --port 5188"
timeout /t 4 /nobreak >nul
start http://localhost:5188
echo Diary app is running at http://localhost:5188
echo Close this window to stop the server.
pause >nul
