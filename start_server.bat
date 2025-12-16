@echo off
echo Starting local server...
echo Please ensure your phone is on the same Wi-Fi.
echo.
echo Address to type on phone: http://[YOUR_IP]:8080
echo.
call npx http-server -c-1 -o
pause
