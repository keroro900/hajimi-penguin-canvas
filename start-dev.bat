@echo off
setlocal

title Hakimi Canvas Dev Launcher
cd /d "%~dp0"
set "ROOT=%~dp0."
set "NODE_MIN_MAJOR=18"
set "NODE_DOWNLOAD_URL=https://nodejs.org/en/download"

echo ==================================================
echo Hakimi Canvas - Dev Launcher
echo ==================================================
echo.
echo Project: %ROOT%
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Please run this bat from the extracted project root folder.
  goto :failed
)

if not exist "backend\package.json" (
  echo [ERROR] backend\package.json was not found.
  echo The source package looks incomplete.
  goto :failed
)

echo [1/6] Checking Node.js and npm...
call :ensure_node
if errorlevel 1 goto :failed

call :ensure_npm
if errorlevel 1 goto :failed

echo.
echo [2/6] Checking root dependencies...
call :ensure_root_dependencies
if errorlevel 1 goto :failed

echo.
echo [3/6] Checking backend dependencies...
call :ensure_backend_dependencies
if errorlevel 1 goto :failed

echo.
echo [4/6] Verifying required commands...
call :verify_required_files
if errorlevel 1 goto :failed

echo.
echo [5/6] Releasing project dev ports 11422 / 18766...
for %%P in (11422 18766) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo   - Killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>nul
  )
)

echo.
echo [6/6] Starting backend and frontend...
start "Hakimi Canvas Backend 18766" /D "%ROOT%" cmd /k npm run dev:backend
timeout /t 2 >nul
start "Hakimi Canvas Frontend 11422" /D "%ROOT%" cmd /k npm run dev:vite
timeout /t 3 >nul

echo.
echo ==================================================
echo Started:
echo   Frontend: http://127.0.0.1:11422
echo   Backend:  http://127.0.0.1:18766/api/status
echo.
echo Note: This script only touches project ports 11422 / 18766.
echo It does not touch 3000 / 3001.
echo ==================================================
start "" "http://127.0.0.1:11422"
pause
exit /b 0

:ensure_node
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js was not found.
  call :install_node_lts
  if errorlevel 1 exit /b 1
)

call :refresh_node_path

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is still unavailable after installation.
  echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
  echo   %NODE_DOWNLOAD_URL%
  start "" "%NODE_DOWNLOAD_URL%"
  exit /b 1
)

call :check_node_version
if errorlevel 1 (
  for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do echo   Current Node.js major version is %%V; %NODE_MIN_MAJOR% or newer is required.
  call :upgrade_node_lts
  if errorlevel 1 exit /b 1
  call :refresh_node_path
  call :check_node_version
  if errorlevel 1 (
    for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do echo [ERROR] Node.js is still too old after update. Current major version: %%V
    echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
    echo   %NODE_DOWNLOAD_URL%
    start "" "%NODE_DOWNLOAD_URL%"
    exit /b 1
  )
)

for /f "delims=" %%V in ('node -v') do echo   Node.js: %%V
exit /b 0

:check_node_version
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= Number(process.env.NODE_MIN_MAJOR || 18) ? 0 : 1)" >nul 2>nul
exit /b %ERRORLEVEL%

:ensure_npm
call :refresh_node_path
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please reinstall Node.js LTS.
  echo   %NODE_DOWNLOAD_URL%
  start "" "%NODE_DOWNLOAD_URL%"
  exit /b 1
)
for /f "delims=" %%V in ('npm -v') do echo   npm: %%V
exit /b 0

:install_node_lts
where winget >nul 2>nul
if errorlevel 1 (
  echo [ERROR] winget was not found, so Node.js cannot be installed automatically.
  echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
  echo   %NODE_DOWNLOAD_URL%
  start "" "%NODE_DOWNLOAD_URL%"
  exit /b 1
)
echo   Installing Node.js LTS with winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo [ERROR] winget could not install Node.js LTS.
  echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
  echo   %NODE_DOWNLOAD_URL%
  start "" "%NODE_DOWNLOAD_URL%"
  exit /b 1
)
exit /b 0

:upgrade_node_lts
where winget >nul 2>nul
if errorlevel 1 (
  echo [ERROR] winget was not found, so Node.js cannot be updated automatically.
  echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
  echo   %NODE_DOWNLOAD_URL%
  start "" "%NODE_DOWNLOAD_URL%"
  exit /b 1
)
echo   Updating Node.js LTS with winget...
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo   winget upgrade did not complete. Trying winget install instead...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [ERROR] winget could not update Node.js LTS.
    echo Please install Node.js %NODE_MIN_MAJOR% or newer manually:
    echo   %NODE_DOWNLOAD_URL%
    start "" "%NODE_DOWNLOAD_URL%"
    exit /b 1
  )
)
exit /b 0

:refresh_node_path
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
exit /b 0

:ensure_root_dependencies
set "ROOT_DEPS_READY=0"
if exist "node_modules" (
  call npm list --depth=0 >nul 2>nul
  if not errorlevel 1 set "ROOT_DEPS_READY=1"
)

if "%ROOT_DEPS_READY%"=="1" (
  echo   Root dependencies are already complete.
  exit /b 0
)

echo   Installing all root dependencies...
call :run_npm_install "%ROOT%"
if errorlevel 1 exit /b 1
exit /b 0

:ensure_backend_dependencies
set "BACKEND_DEPS_READY=0"
pushd backend
if exist "node_modules" (
  call npm list --depth=0 >nul 2>nul
  if not errorlevel 1 set "BACKEND_DEPS_READY=1"
)
popd

if "%BACKEND_DEPS_READY%"=="1" (
  echo   Backend dependencies are already complete.
  exit /b 0
)

echo   Installing all backend dependencies...
call :run_npm_install "%ROOT%\backend"
if errorlevel 1 exit /b 1
exit /b 0

:run_npm_install
set "INSTALL_DIR=%~1"
pushd "%INSTALL_DIR%"
if errorlevel 1 exit /b 1

call npm install
if not errorlevel 1 goto :npm_install_ok

echo   npm install failed. Retrying with npmmirror registry...
call npm install --registry=https://registry.npmmirror.com
if errorlevel 1 goto :npm_install_failed

:npm_install_ok
popd
exit /b 0

:npm_install_failed
popd
exit /b 1

:verify_required_files
if not exist "node_modules\.bin\vite.cmd" (
  echo [ERROR] Missing root dependency: vite.
  exit /b 1
)
if not exist "node_modules\electron\package.json" (
  echo [ERROR] Missing root dependency: electron.
  exit /b 1
)
if not exist "node_modules\electron-builder\package.json" (
  echo [ERROR] Missing root dependency: electron-builder.
  exit /b 1
)
if not exist "backend\node_modules\express\package.json" (
  echo [ERROR] Missing backend dependency: express.
  exit /b 1
)
if not exist "backend\node_modules\sharp\package.json" (
  echo [ERROR] Missing backend dependency: sharp.
  exit /b 1
)
echo   Required commands and packages are ready.
exit /b 0

:failed
echo.
echo ==================================================
echo Dev startup failed.
echo.
echo If you only want to use the app, run the packaged installer instead.
echo Source-code dev mode needs Node.js, npm, and project dependencies.
echo ==================================================
pause
exit /b 1
