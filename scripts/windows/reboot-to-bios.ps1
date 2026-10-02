# Ultra-fast SSH reboot into UEFI/BIOS. Leave running; catches short uptime window.
param(
  [string]$TargetHost = "192.168.0.82",
  [string]$User = "retail",
  [string]$Password = "retail"
)

$plink = @(
  "$env:ProgramFiles\PuTTY\plink.exe",
  "${env:ProgramFiles(x86)}\PuTTY\plink.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $plink) { throw "Installera PuTTY (plink)." }

$remote = "echo '$Password' | sudo -S systemctl reboot --firmware-setup"
Write-Host "Vantar pa SSH $User@${TargetHost}:22 — lat skriptet kora tills BIOS syns."

while ($true) {
  $open = $false
  try {
    $c = New-Object Net.Sockets.TcpClient
    $iar = $c.BeginConnect($TargetHost, 22, $null, $null)
    $open = $iar.AsyncWaitHandle.WaitOne(150, $false)
    if ($open) { try { $c.EndConnect($iar) } catch { $open = $false } }
    $c.Close()
  } catch { $open = $false }

  if (-not $open) { Start-Sleep -Milliseconds 100; continue }

  Write-Host "$(Get-Date -Format HH:mm:ss) port 22 uppe — skickar kommando..."
  # cmd echo y| avoids PowerShell pipeline hang on host-key prompt
  $out = cmd /c "echo y| `"$plink`" -ssh $User@$TargetHost -pw $Password -T `"$remote`"" 2>&1
  $out | ForEach-Object { Write-Host $_ }
  Write-Host "Klar/brutit. Om BIOS inte syns: vantar pa nasta fonster..."
  Start-Sleep -Seconds 2
}
