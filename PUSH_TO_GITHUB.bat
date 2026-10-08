@echo off
title Push Coin Rush Arena to GitHub
echo ==================================================
echo Pushing Coin Rush Arena to GitHub (Naresh110-Git)...
echo ==================================================
echo.
set /p REPO_NAME="Enter your GitHub Repository Name (e.g. Coin-Rush-Arena-Multiplayer): "

git remote remove origin 2>nul
git remote add origin https://github.com/Naresh110-Git/%REPO_NAME%.git
git branch -M main
git push -u origin main

echo.
echo ==================================================
echo Done! If prompted, log in with your GitHub credentials.
echo ==================================================
pause
