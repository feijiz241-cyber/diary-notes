@echo off
cd /d "%~dp0"
set PATH=C:\Users\quan\.workbuddy\binaries\node\versions\22.22.2-2;%PATH%

echo Starting diary backend + web app...

rem backend: long-running process
start /b node backend/index.mjs

rem frontend: call vite directly (skip npm overhead)
start /b node node_modules/vite/bin/vite.js --config frontend/vite.config.ts --port 5188

rem wait for backend (up to ~10s)
echo Waiting for backend...
set /a tries=0
:wait_backend
node -e "fetch('http://localhost:5189/api/entries').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 goto backend_ok
set /a tries+=1
if %tries% GEQ 10 (
  echo [ERROR] backend did not start in 10s, check backend/index.mjs
  goto fail
)
timeout /t 1 /nobreak >nul
goto wait_backend
:backend_ok

rem wait for frontend (up to ~20s)
echo Waiting for web app...
set /a tries=0
:wait_frontend
node -e "fetch('http://localhost:5188/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 goto frontend_ok
set /a tries+=1
if %tries% GEQ 20 (
  echo [ERROR] frontend did not start in 20s. If port is in use, close the running diary app first.
  goto fail
)
timeout /t 1 /nobreak >nul
goto wait_frontend
:frontend_ok

start http://localhost:5188
echo Diary app running at http://localhost:5188 (backend on 5189)
echo Close this window to stop.
pause >nul
exit /b 0

:fail
echo Startup failed, window kept open for diagnostics.
pause >nul
exit /b 1
