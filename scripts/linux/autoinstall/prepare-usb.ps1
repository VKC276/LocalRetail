# Builds cidata seed for Ubuntu autoinstall from Windows.
# 1) Sets password hash in user-data (prompt if missing)
# 2) Copies seed files to out\cidata\
# 3) Tries to build out\localretail-cidata.iso (WSL / oscdimg)
#
# Then follow README: Ventoy USB + Ubuntu Server ISO + cidata ISO.
param(
  [string]$Password,
  [switch]$SkipIso
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Out = Join-Path $Root "out"
$Stage = Join-Path $Out "cidata"
$UserData = Join-Path $Root "user-data"

if (-not (Test-Path $UserData)) {
  throw "Saknar user-data i $Root"
}

function Get-PasswordHash([string]$Plain) {
  & (Join-Path $Root "make-password.ps1") -Password $Plain
}

$content = Get-Content -Raw -Path $UserData
if ($content -match "REPLACE_WITH_PASSWORD_HASH") {
  if (-not $Password) {
    $secure = Read-Host -AsSecureString "Lösenord för kiosk-användaren"
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
  }
  if ([string]::IsNullOrWhiteSpace($Password)) {
    throw "Lösenord krävs."
  }
  $hash = Get-PasswordHash $Password
  $content = $content.Replace("REPLACE_WITH_PASSWORD_HASH", $hash)
  Set-Content -Path $UserData -Value $content -NoNewline -Encoding utf8
  Write-Host "Password-hash sparad i user-data."
} else {
  Write-Host "user-data har redan en password-hash."
}

if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Path $Stage | Out-Null

$files = @(
  "user-data",
  "meta-data",
  "open-kiosk.sh",
  "localretail-kiosk-setup.sh",
  "localretail-kiosk-setup.service"
)
foreach ($name in $files) {
  $src = Join-Path $Root $name
  if (-not (Test-Path $src)) { throw "Saknar $name" }
  Copy-Item $src (Join-Path $Stage $name)
}

$Iso = Join-Path $Out "localretail-cidata.iso"
if (Test-Path $Iso) { Remove-Item -Force $Iso }

Write-Host "Seed-mapp: $Stage"

if ($SkipIso) {
  Write-Host "Hoppar över ISO (-SkipIso). Packa mappen cidata till ISO med volymetikett CIDATA (t.ex. ImgBurn)."
  exit 0
}

function New-CidataIso {
  param([string]$SourceDir, [string]$DestIso)

  # 1) WSL genisoimage / mkisofs / xorriso
  if (Get-Command wsl -ErrorAction SilentlyContinue) {
    $wslDir = (wsl wslpath -a ($SourceDir -replace '\\', '/')) 2>$null
    $wslIso = (wsl wslpath -a ($DestIso -replace '\\', '/')) 2>$null
    if ($wslDir -and $wslIso) {
      $cmds = @(
        "genisoimage -output `"$wslIso`" -volid cidata -joliet -rock `"$wslDir`"",
        "mkisofs -output `"$wslIso`" -volid cidata -joliet -rock `"$wslDir`"",
        "xorriso -as mkisofs -o `"$wslIso`" -V cidata -J -R `"$wslDir`""
      )
      foreach ($cmd in $cmds) {
        wsl bash -lc $cmd 2>$null
        if ($LASTEXITCODE -eq 0 -and (Test-Path $DestIso)) { return $true }
      }
    }
  }

  # 2) Windows ADK oscdimg
  $oscdimg = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe",
    "${env:ProgramFiles}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($oscdimg) {
    & $oscdimg -lCIDATA -j1 -r $SourceDir $DestIso
    if ($LASTEXITCODE -eq 0 -and (Test-Path $DestIso)) { return $true }
  }

  return $false
}

if (New-CidataIso -SourceDir $Stage -DestIso $Iso) {
  Write-Host "ISO skapad: $Iso"
} else {
  Write-Host ""
  Write-Host "Kunde inte skapa ISO automatiskt. Seed-mappen är klar:"
  Write-Host "  $Stage"
  Write-Host ""
  Write-Host "Skapa ISO manuellt med ImgBurn (gratis):"
  Write-Host "  1. Mode → Build"
  Write-Host "  2. Lägg till innehållet i cidata-mappen (inte mappen själv som enda rotfil om ImgBurn frågar — välj filerna)"
  Write-Host "  3. Options → Volume Label = cidata"
  Write-Host "  4. Spara som localretail-cidata.iso"
  Write-Host ""
  Write-Host "Eller aktivera WSL och kör om:  wsl sudo apt-get install -y genisoimage"
  Write-Host "Sen:  .\prepare-usb.ps1"
  exit 0
}

Write-Host ""
Write-Host "Nästa steg (Windows):"
Write-Host "  1. Installera Ventoy på USB: https://www.ventoy.net/"
Write-Host "  2. Ladda ner Ubuntu 24.04 Server ISO (amd64)"
Write-Host "  3. Kopiera till Ventoy-USB:n:"
Write-Host "       - ubuntu-24.04*-live-server-amd64.iso"
Write-Host "       - $Iso"
Write-Host "  4. Boota USB på kassadatorn och välj Ubuntu Server-ISO:n"
