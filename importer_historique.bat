@echo off
chcp 65001 >nul
title SAGI - Import de l'historique des anciennes bases Access
cd /d "%~dp0"
echo =======================================================
echo   IMPORT DE L'HISTORIQUE (anciennes bases Access .mdb)
echo =======================================================
echo.
echo Indiquez le dossier qui contient vos anciennes bases (ex: IMMOBILISATIONS),
echo sous-dossiers compris. Une simulation est faite d'abord : rien n'est ecrit.
echo.
set /p DOSSIER=Chemin du dossier : 
python backend\import_historique.py "%DOSSIER%" --simulation
echo.
set /p OK=Lancer l'import reel ? (O/N) : 
if /i "%OK%"=="O" python backend\import_historique.py "%DOSSIER%"
echo.
pause
