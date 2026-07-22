@echo off
cd /d "%~dp0"
set PATH=C:\Users\quan\.workbuddy\binaries\node\versions\22.22.2;%PATH%

echo Starting diary backend + web app...

:: 后端：常驻进程
start /b node backend/index.mjs

:: 前端：直接调 vite（省 npm 启动开销 ~700ms）
start /b node node_modules/vite/bin/vite.js --config frontend/vite.config.ts --port 5188

:: 等后端探活（最多 ~10s）
echo Waiting for backend...
set /a tries=0
:wait_backend
node -e "fetch('http://localhost:5189/api/entries').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 goto backend_ok
set /a tries+=1
if %tries% GEQ 10 (
  echo [ERROR] 后端未在 10s 内就绪，请检查 backend/index.mjs 是否报错
  goto fail
)
timeout /t 1 /nobreak >nul
goto wait_backend
:backend_ok

:: 等前端探活（最多 ~20s）
echo Waiting for web app...
set /a tries=0
:wait_frontend
node -e "fetch('http://localhost:5188/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if %errorlevel%==0 goto frontend_ok
set /a tries+=1
if %tries% GEQ 20 (
  echo [ERROR] 前端未在 20s 内就绪。若提示端口被占用，请先关闭已运行的日记网页再试。
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
echo 启动失败，窗口保持打开以便查看错误信息。
pause >nul
exit /b 1
