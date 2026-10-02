@echo off
setlocal EnableExtensions
REM Ultra-fast: wait for TCP/22 then fire one SSH command (sudo password via -S).
REM Leave this running — it catches the short window after each reboot.

set HOST=192.168.0.82
set USER=retail
set PASS=retail
set PLINK=C:\Program Files\PuTTY\plink.exe
if not exist "%PLINK%" set PLINK=C:\Program Files (x86)\PuTTY\plink.exe
if not exist "%PLINK%" (
  echo Installera PuTTY forst.
  exit /b 1
)

echo Loopar mot %USER%@%HOST% — lat sta igang tills BIOS syns.
echo.

:loop
REM PowerShell only as a fast port probe (100ms), then immediate plink via cmd
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.ReceiveTimeout=200;$c.SendTimeout=200;$iar=$c.BeginConnect('%HOST%',22,$null,$null);if(-not $iar.AsyncWaitHandle.WaitOne(200,$false)){$c.Close();exit 1};$c.EndConnect($iar);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
  ping -n 1 -w 100 127.0.0.1 >nul
  goto loop
)

echo Port 22 oppen — skickar reboot --firmware-setup ...
echo y| "%PLINK%" -ssh %USER%@%HOST% -pw %PASS% -T -batch "echo %PASS% | sudo -S systemctl reboot --firmware-setup"
echo.
echo Om sessionen dog av reboot: kolla skarmen for BIOS.
echo Om det misslyckades: loopar igen om 1s ...
ping -n 2 127.0.0.1 >nul
goto loop
