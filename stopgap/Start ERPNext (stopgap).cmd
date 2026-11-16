@echo off
title ERPNext stopgap - old Purchase Order system (keep this window open)
echo.
echo   ERPNext stopgap: the old Purchase Order system, restored from its backup.
echo   Keep this window open while ERPNext is in use. Close it to stop ERPNext.
echo.
echo   Your browser opens http://localhost:8000 in about 30 seconds.
echo.
start "" /min cmd /c "timeout /t 30 /nobreak >nul & start http://localhost:8000"
wsl.exe -d Ubuntu-22.04 -u frappe --cd ~ -- bash -lc "source ~/.nvm/nvm.sh >/dev/null && nvm use 16 >/dev/null && cd ~/frappe-bench && bench start"
