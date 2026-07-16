@echo off
setlocal

set "AIS_SCRIPT_DIR=%~dp0"
set "AIS_APP_ROOT=%AIS_SCRIPT_DIR%"

if not exist "%AIS_APP_ROOT%\frontend\package.json" (
  if exist "%AIS_SCRIPT_DIR%project\frontend\package.json" set "AIS_APP_ROOT=%AIS_SCRIPT_DIR%project"
)

set "AIS_RUNTIME=%AIS_APP_ROOT%\\.runtime-openapi"
set "AIS_QUIET="

if "%AIS_OPENAPI_BACKEND_PORT%"=="" set "AIS_OPENAPI_BACKEND_PORT=8020"
if "%AIS_OPENAPI_FRONTEND_PORT%"=="" set "AIS_OPENAPI_FRONTEND_PORT=3020"

if /I "%~1"=="/quiet" set "AIS_QUIET=1"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$quiet=$env:AIS_QUIET -eq '1';" ^
  "if (-not $quiet) { Write-Host 'Stopping KB OpenAPI production services...' }" ^
  "function Stop-ProcessTree([int]$processId) { if ($processId -le 0) { return }; Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', $processId, '/T', '/F') -WindowStyle Hidden -Wait | Out-Null }" ^
  "$runtime=$env:AIS_RUNTIME;" ^
  "if ($runtime -and (Test-Path $runtime)) {" ^
  "  foreach ($name in @('backend.pid','frontend.pid')) {" ^
  "    $pidFile=Join-Path $runtime $name;" ^
  "    if (Test-Path $pidFile) {" ^
  "      foreach ($line in Get-Content $pidFile) {" ^
  "        $text=$line.Trim();" ^
  "        if ($text -match '^\d+$') { Stop-ProcessTree ([int]$text) }" ^
  "      }" ^
  "      Remove-Item -Force $pidFile -ErrorAction SilentlyContinue;" ^
  "    }" ^
  "  }" ^
  "}" ^
  "$backendPort=[int]$env:AIS_OPENAPI_BACKEND_PORT;" ^
  "$frontendPort=[int]$env:AIS_OPENAPI_FRONTEND_PORT;" ^
  "$portProcesses=Get-NetTCPConnection -LocalPort $backendPort, $frontendPort -State Listen | Select-Object -ExpandProperty OwningProcess -Unique;" ^
  "$portProcesses | Where-Object { $_ } | ForEach-Object { Stop-ProcessTree ([int]$_) }"

if errorlevel 1 exit /b %ERRORLEVEL%
if not defined AIS_QUIET echo Stopped.

endlocal
