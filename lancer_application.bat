@echo off
title SAGI IMMO FISCAL - Serveur
echo =======================================================
echo    SAGI - GESTION DES IMMOBILISATIONS ET FISCALITE 2024
echo =======================================================
echo.
echo Demarrage du serveur et ouverture automatique de l'application...
echo.

cd /d "%~dp0"
python backend\app.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ATTENTION] Python n'est pas detecte ou a rencontre une erreur.
    echo Ouverture directe de l'application dans votre navigateur...
    start "" "%~dp0frontend\index.html"
)

pause

