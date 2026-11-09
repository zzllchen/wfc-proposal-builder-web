@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. You can still open index.html directly in Edge or Chrome,
  echo but Save PDF will then use the print window and Save PowerPoint will not be available.
  pause
  exit /b 1
)
start "" http://localhost:8081/
python server.py
pause
