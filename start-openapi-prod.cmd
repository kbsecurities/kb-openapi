@echo off
setlocal

set "AIS_SCRIPT_DIR=%~dp0"
set "AIS_APP_ROOT=%AIS_SCRIPT_DIR%"

if not exist "%AIS_APP_ROOT%\frontend\package.json" (
  if exist "%AIS_SCRIPT_DIR%project\frontend\package.json" set "AIS_APP_ROOT=%AIS_SCRIPT_DIR%project"
)

if not exist "%AIS_APP_ROOT%\frontend\package.json" (
  echo Could not find frontend package.json.
  echo Expected: "%AIS_APP_ROOT%\frontend\package.json"
  exit /b 1
)

set "AIS_OPENAPI_MODE=production"
if "%AIS_OPENAPI_BACKEND_PORT%"=="" set "AIS_OPENAPI_BACKEND_PORT=8020"
if "%AIS_OPENAPI_FRONTEND_PORT%"=="" set "AIS_OPENAPI_FRONTEND_PORT=3020"

set "AIS_RUNTIME=%AIS_APP_ROOT%\\.runtime-openapi"

if not exist "%AIS_RUNTIME%" mkdir "%AIS_RUNTIME%"

echo === KB OpenAPI Production Environment ===
echo App root: %AIS_APP_ROOT%
echo Frontend: http://localhost:%AIS_OPENAPI_FRONTEND_PORT%
echo Backend:  http://localhost:%AIS_OPENAPI_BACKEND_PORT%
echo.

if exist "%AIS_SCRIPT_DIR%stop-openapi-prod.cmd" (
  call "%AIS_SCRIPT_DIR%stop-openapi-prod.cmd" /quiet
  if errorlevel 1 (
    echo Existing process cleanup failed. Continuing with startup...
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$appRoot=$env:AIS_APP_ROOT.TrimEnd('\\');" ^
  "$runtime=$env:AIS_RUNTIME;" ^
  "$frontend=Join-Path $appRoot 'frontend';" ^
  "$backendPort=$env:AIS_OPENAPI_BACKEND_PORT;" ^
  "$frontendPort=$env:AIS_OPENAPI_FRONTEND_PORT;" ^
  "$backendBase=\"http://localhost:$backendPort\";" ^
  "New-Item -ItemType Directory -Force $runtime | Out-Null;" ^
  "$uv=Get-Command uv -ErrorAction SilentlyContinue;" ^
  "if (-not $uv) { throw 'uv command not found. Install uv or add it to PATH.' }" ^
  "$npm=Get-Command npm -ErrorAction SilentlyContinue;" ^
  "if (-not $npm) { throw 'npm command not found. Install Node.js/npm or add it to PATH.' }" ^
  "if (-not (Test-Path (Join-Path $frontend 'package.json'))) { throw ('frontend package.json not found: ' + $frontend) }" ^
  "if (-not (Test-Path (Join-Path $frontend 'node_modules'))) { Write-Host '[Frontend] node_modules not found, running npm install...'; Push-Location $frontend; cmd.exe /d /s /c 'npm install'; $code=$LASTEXITCODE; Pop-Location; if ($code -ne 0) { exit $code } }" ^
  "$backendOut=Join-Path $runtime 'backend.log';" ^
  "$backendErr=Join-Path $runtime 'backend.err.log';" ^
  "$frontendOut=Join-Path $runtime 'frontend.log';" ^
  "$frontendErr=Join-Path $runtime 'frontend.err.log';" ^
  "Write-Host ('[Backend] Starting on port ' + $backendPort + ' (production)...');" ^
  "$backendArgs=@('run','python','-m','uvicorn','backend.main:app','--host','0.0.0.0','--port',$backendPort);" ^
  "$backend=Start-Process -FilePath $uv.Source -ArgumentList $backendArgs -WorkingDirectory $appRoot -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru;" ^
  "$backend.Id | Set-Content -Path (Join-Path $runtime 'backend.pid') -Encoding ascii;" ^
  "Start-Sleep -Seconds 2;" ^
  "if ($backend.HasExited) { throw ('Backend failed to start. See ' + $backendErr) }" ^
  "Write-Host ('[Frontend] Starting on port ' + $frontendPort + ' (production)...');" ^
  "$nodeOptions='--disable-warning=DEP0060';" ^
  "if ($env:NODE_OPTIONS) { $nodeOptions = $nodeOptions + ' ' + $env:NODE_OPTIONS }" ^
  "$frontendEnv='set \"NODE_OPTIONS=' + $nodeOptions + '\" && set \"NEXT_PUBLIC_API_URL=' + $backendBase + '\" && set \"NEXT_PUBLIC_OPENAPI_TEST=1\" && set \"NEXT_PUBLIC_OPENAPI_MODE=production\" && ';" ^
  "$frontendCommand = $frontendEnv + 'npm run build && npm run start -- --port ' + $frontendPort;" ^
  "$frontendProc=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c', $frontendCommand) -WorkingDirectory $frontend -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru;" ^
  "$frontendProc.Id | Set-Content -Path (Join-Path $runtime 'frontend.pid') -Encoding ascii;" ^
  "Start-Sleep -Seconds 2;" ^
  "if ($frontendProc.HasExited) { throw ('Frontend failed to start. See ' + $frontendErr) }" ^
  "Write-Host ('[Backend] PID: ' + $backend.Id);" ^
  "Write-Host ('[Frontend] PID: ' + $frontendProc.Id);" ^
  "Write-Host ('[Backend URL] ' + $backendBase);" ^
  "Write-Host ('[Frontend URL] http://localhost:' + $frontendPort);"

if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo Started.
echo Logs:
echo   %AIS_RUNTIME%\backend.log
echo   %AIS_RUNTIME%\backend.err.log
echo   %AIS_RUNTIME%\frontend.log
echo   %AIS_RUNTIME%\frontend.err.log
echo.
echo Run stop-openapi-prod.cmd to stop this environment.

endlocal
