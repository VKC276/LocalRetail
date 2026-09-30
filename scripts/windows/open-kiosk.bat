@echo off
setlocal

rem Självbetjäningskassa i helskärm (Chrome eller Edge).
rem Dubbelklicka, eller lägg en genväg i Autostart.

set "URL=https://retail.vastervikclimbing.se/?kiosk=1"
if not "%LOCAL_RETAIL_URL%"=="" set "URL=%LOCAL_RETAIL_URL%"

set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if "%BROWSER%"=="" (
  echo Hittade varken Chrome eller Edge. Installera en av dem.
  pause
  exit /b 1
)

rem Separat profil så kioskinställningar inte blandas med vanlig surfning.
set "PROFILE=%LOCALAPPDATA%\LocalRetailKiosk"

start "" "%BROWSER%" ^
  --kiosk "%URL%" ^
  --user-data-dir="%PROFILE%" ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-translate ^
  --disable-features=TranslateUI ^
  --check-for-update-interval=31536000 ^
  --overscroll-history-navigation=0

endlocal
