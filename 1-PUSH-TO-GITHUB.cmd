@echo off
setlocal
cd /d "%~dp0"
echo ===============================================================
echo   Hunt for Jeremy  -  Push to GitHub (run this ONCE)
echo ===============================================================
where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Git is not installed. Please install Git for Windows first:
  echo  https://git-scm.com/download/win
  echo  Then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo Cleaning any old git data...
if exist ".git" rmdir /s /q ".git"
git init -b main
git add -A
git -c user.email="salvatoretbosco@gmail.com" -c user.name="SalvatoreBoscoDev" commit -m "initial commit"
git remote add origin https://github.com/SalvatoreBoscoDev/-jeremysiege.git
echo.
echo A GitHub login window may pop up - sign in as SalvatoreBoscoDev.
echo.
git push -u origin main
echo.
echo Done. If you see no errors above, your code is on GitHub and the
echo server will pick it up within about a minute.
echo.
pause
