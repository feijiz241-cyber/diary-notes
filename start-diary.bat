@echo off
rem ============================================================
rem  Diary launcher.
rem
rem  Double-click           -> FAST mode: one backend process serves
rem                            both the pages and /api on 5189;
rem                            builds only when the source changed.
rem  start-diary.bat dev    -> DEV mode: vite dev on 5188 + backend
rem                            on 5189, hot reload while editing.
rem
rem  Why one file and not two: on this machine, files created by the
rem  agent tools carry an extra ACL entry that makes Explorer treat
rem  them as "from the Internet" and ask for confirmation on every
rem  launch. Editing this existing file in place keeps it trusted,
rem  so both modes live here instead of shipping a second .bat.
rem ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
rem  Use the bundled node if this machine has one; otherwise fall back to
rem  whatever `node` is on PATH (any Node 20+ works).
set "BUNDLED_NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%BUNDLED_NODE%\node.exe" set "PATH=%BUNDLED_NODE%;%PATH%"
set SLEEP=%SystemRoot%\System32\timeout.exe

if /i "%~1"=="dev" goto dev_mode

rem ---------------- fast mode: production, one process ----------------
echo [1/3] Checking the web app...
node scripts\build-if-stale.mjs
if errorlevel 1 goto build_fail

echo [2/3] Starting backend on 5189 (serves pages + API)...
rem free 5189 from stale instances; leave 5188 alone
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":5189 " ^| findstr /c:"LISTENING"') do taskkill /pid %%p /f >nul 2>&1
start /b node backend/index.mjs

echo [3/3] Waiting for http://127.0.0.1:5189 ...
node scripts\wait-for-server.mjs http://127.0.0.1:5189 15000
if errorlevel 1 goto backend_timeout

if not defined DIARY_NO_BROWSER start http://127.0.0.1:5189
echo.
echo Diary app running at http://127.0.0.1:5189  (single process, fast mode)
echo For dev mode (hot reload while editing) run: start-diary.bat dev
echo Close this window to stop.
if not defined DIARY_HEADLESS pause >nul
exit /b 0

rem ---------------- dev mode: vite dev + backend ----------------
:dev_mode
echo Starting diary backend + web app (dev mode)...

rem free ports 5188/5189 from stale instances (old windows / zombie node)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":5188 " ^| findstr /c:"LISTENING"') do taskkill /pid %%p /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":5189 " ^| findstr /c:"LISTENING"') do taskkill /pid %%p /f >nul 2>&1

rem backend: long-running process
start /b node backend/index.mjs

rem frontend: call vite directly (skip npm overhead)
start /b node node_modules/vite/bin/vite.js --config frontend/vite.config.ts --port 5188

rem wait for backend (up to ~10s); it binds 127.0.0.1 only, so probe the literal IPv4 loopback
echo Waiting for backend...
set /a tries=0
:wait_backend
node -e "fetch('http://127.0.0.1:5189/api/entries').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 goto backend_ok
set /a tries+=1
if %tries% GEQ 10 (
  echo [ERROR] backend did not start in 10s, check backend/index.mjs
  goto fail
)
%SLEEP% /t 1 /nobreak >nul
goto wait_backend
:backend_ok

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
%SLEEP% /t 1 /nobreak >nul
goto wait_frontend
:frontend_ok

if not defined DIARY_NO_BROWSER start http://localhost:5188
echo Diary app running at http://localhost:5188 (backend on 5189)
echo Close this window to stop.
if not defined DIARY_HEADLESS pause >nul
exit /b 0

rem ---------------- error branches ----------------
:build_fail
echo.
echo [ERROR] Build failed. Nothing was started.
echo   - The old dist/ is still on disk; "start-diary.bat dev" still works.
echo   - Scroll up for the vite error message.
goto fail

:backend_timeout
echo.
echo [ERROR] backend did not answer in 15s. Check the messages above.
goto fail

:fail
echo Startup failed, window kept open for diagnostics.
if not defined DIARY_HEADLESS pause >nul
exit /b 1
