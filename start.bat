@echo off
cd /d "%~dp0"
echo Menjalankan server DPMPTSP...
start "" http://localhost:3000
node server.js
pause
