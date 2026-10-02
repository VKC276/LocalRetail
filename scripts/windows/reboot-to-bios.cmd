@echo off
REM Snabbaste varianten om PuTTY/plink finns. Loopar tills SSH nair kiosken.
set HOST=192.168.0.82
set USER=retail
set PASS=retail
set PLINK="%ProgramFiles%\PuTTY\plink.exe"
if not exist %PLINK% set PLINK="%ProgramFiles(x86)%\PuTTY\plink.exe"
if not exist %PLINK% (
  echo Installera PuTTY eller kor: powershell -ExecutionPolicy Bypass -File reboot-to-bios.ps1
  exit /b 1
)

echo Forsoker SSH %USER%@%HOST% ...
:loop
echo y| %PLINK% -ssh %USER%@%HOST% -pw %PASS% -T "echo %PASS% | sudo -S systemctl reboot --firmware-setup"
if %ERRORLEVEL%==0 goto ok
REM reboot bryter ofta sessionen med felkod — prova antingen
timeout /t 1 /nobreak >nul
goto loop
:ok
echo Skickat. Kolla skarmen for BIOS/UEFI Setup.
