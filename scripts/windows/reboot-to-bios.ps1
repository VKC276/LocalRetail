# Reboot a stuck kiosk into UEFI/BIOS setup over SSH (Windows).
# Must finish within the short window before the reboot-loop kills the session.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\reboot-to-bios.ps1
#   powershell -ExecutionPolicy Bypass -File .\reboot-to-bios.ps1 -Host 192.168.0.82 -User retail -Password retail
#
# Prefers PuTTY plink (password on cmdline). Falls back to OpenSSH + sshpass if present.

param(
  [string]$TargetHost = "192.168.0.82",
  [string]$User = "retail",
  [string]$Password = "retail",
  [int]$ConnectTimeoutSec = 3,
  [int]$Tries = 40,
  [int]$DelayMs = 500
)

$ErrorActionPreference = "Continue"
$remoteCmd = "echo '$Password' | sudo -S systemctl reboot --firmware-setup"

function Find-Plink {
  $candidates = @(
    (Get-Command plink -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    "$env:ProgramFiles\PuTTY\plink.exe",
    "${env:ProgramFiles(x86)}\PuTTY\plink.exe",
    "$env:LOCALAPPDATA\Programs\PuTTY\plink.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

function Invoke-ViaPlink([string]$Plink) {
  # Auto-accept host key once for recovery; sudo password via -S (one remote command).
  $allArgs = @(
    "-ssh", "$User@$TargetHost",
    "-pw", $Password,
    "-T",
    "-P", "22",
    $remoteCmd
  )
  # echo y accepts "Store key in cache?" on first connect
  "y" | & $Plink @allArgs 2>&1
  return $LASTEXITCODE
}

function Invoke-ViaOpenSsh {
  $ssh = Get-Command ssh -ErrorAction SilentlyContinue
  if (-not $ssh) { return $null }

  $sshpass = Get-Command sshpass -ErrorAction SilentlyContinue
  if ($sshpass) {
    & sshpass -p $Password ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL `
      -o ConnectTimeout=$ConnectTimeoutSec "$User@$TargetHost" $remoteCmd 2>&1
    return $LASTEXITCODE
  }

  # Last resort: interactive OpenSSH (you type password once). sudo uses -S from the remote cmd.
  Write-Host "Ingen plink/sshpass — SSH fragar efter losenord. Skriv: $Password"
  & ssh -o StrictHostKeyChecking=no -o ConnectTimeout=$ConnectTimeoutSec `
    "$User@$TargetHost" $remoteCmd 2>&1
  return $LASTEXITCODE
}

Write-Host "Mal: ${User}@${TargetHost}"
Write-Host "Kommando: systemctl reboot --firmware-setup"
Write-Host "Forsoker upp till $Tries ganger (snabb loop)..."
Write-Host ""

$plink = Find-Plink
if ($plink) {
  Write-Host "Anvander plink: $plink"
} else {
  Write-Host "plink saknas (installera PuTTY for battre chans). Forsoker OpenSSH."
}

for ($i = 1; $i -le $Tries; $i++) {
  Write-Host "[$i/$Tries] ansluter..."
  $code = $null
  $out = $null

  if ($plink) {
    $out = Invoke-ViaPlink $plink
    $code = $LASTEXITCODE
  } else {
    $out = Invoke-ViaOpenSsh
    $code = $LASTEXITCODE
  }

  if ($out) { $out | ForEach-Object { Write-Host $_ } }

  # Connection refused / timed out -> try again quickly
  if ($code -eq 0) {
    Write-Host ""
    Write-Host "Kommando skickat. Maskinen bor starta om till BIOS/UEFI Setup."
    Write-Host "Har du skarm: vant pa BIOS. Annars: F2 efter strom-cykel."
    exit 0
  }

  # Some SSH clients return non-zero because the reboot kills the session — that can still be success.
  $text = ($out | Out-String)
  if ($text -match "firmware-setup|Connection reset|closed by remote|Broken pipe|reboot") {
    Write-Host ""
    Write-Host "Session brots troligen av reboot — det kan vara OK. Kolla skarmen for BIOS."
    exit 0
  }

  Start-Sleep -Milliseconds $DelayMs
}

Write-Host ""
Write-Host "Kunde inte na $TargetHost i tid. Kor skriptet igen sa fort lampan/nat blinkar efter reboot."
exit 1
