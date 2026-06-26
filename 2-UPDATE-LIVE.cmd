@echo off
setlocal
cd /d "%~dp0"
echo Pushing your latest changes to the live game...
git add -A
git -c user.email="salvatoretbosco@gmail.com" -c user.name="SalvatoreBoscoDev" commit -m "update"
git push origin main
echo.
echo Pushed. Live within ~60 seconds at https://jeremysiege.com
echo (Players just refresh their browser.)
echo.
pause
