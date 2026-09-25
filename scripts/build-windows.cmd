@echo off
setlocal
cd /d "%~dp0\.."

echo.
echo === Ivoire-Gestion : creation de l'installateur Windows ===
echo Dossier : %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js 22 LTS ou plus recent, puis relancez ce fichier.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm est introuvable. Reinstallez Node.js puis relancez ce fichier.
  pause
  exit /b 1
)

echo Installation propre des dependances...
call npm install
if errorlevel 1 goto erreur

echo Verification des tests...
call npm test -- --runInBand
if errorlevel 1 goto erreur

echo Construction de Ivoire-Gestion Setup.exe et Portable.exe...
call npm run dist:windows
if errorlevel 1 goto erreur

echo.
echo Terminé. Les fichiers executables sont dans le dossier release.
start "" "%CD%\release"
pause
exit /b 0

:erreur
echo.
echo La creation de l'executable a echoue. Copiez le message d'erreur et envoyez-le au support.
pause
exit /b 1
