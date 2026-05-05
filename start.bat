@echo off
chcp 65001 > nul
echo ╔══════════════════════════════════════════╗
echo ║   TLS Event Manager - Starting...        ║
echo ║   Timon Live Sound Planning Tool         ║
echo ╚══════════════════════════════════════════╝
echo.

REM Try Python first
python --version > nul 2>&1
if %errorlevel% == 0 (
    echo Starting server with Python...
    start /B python -m http.server 8080 > nul 2>&1
    timeout /t 2 > nul
    start http://localhost:8080
    goto :done
)

REM Try Python3
python3 --version > nul 2>&1
if %errorlevel% == 0 (
    echo Starting server with Python3...
    start /B python3 -m http.server 8080 > nul 2>&1
    timeout /t 2 > nul
    start http://localhost:8080
    goto :done
)

REM Fallback: just open the file directly
echo No Python found - opening file directly (some features may be limited)...
start index.html

goto :done

:done
echo.
echo TLS Event Manager is running!
echo Press any key to exit this window (server keeps running in background)...
pause > nul
