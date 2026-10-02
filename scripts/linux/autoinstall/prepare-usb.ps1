# Builds cidata seed for Ubuntu autoinstall from Windows.
# 1) Sets password hash in user-data (prompt if missing)
# 2) Copies seed files to out\cidata\
# 3) Builds out\localretail-cidata.iso (IMAPI2 / WSL / oscdimg)
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

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

if (-not (Test-Path $UserData)) {
  throw "Saknar user-data i $Root"
}

function Get-PasswordHash([string]$Plain) {
  & (Join-Path $Root "make-password.ps1") -Password $Plain
}

$content = Get-Content -Raw -Path $UserData
# Strip UTF-8 BOM if present (breaks cloud-init)
if ($content.Length -gt 0 -and [int][char]$content[0] -eq 0xFEFF) {
  $content = $content.Substring(1)
}
if ($content -match "REPLACE_WITH_PASSWORD_HASH") {
  if (-not $Password) {
    $secure = Read-Host -AsSecureString "Losenord for kiosk-anvandaren"
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
  }
  if ([string]::IsNullOrWhiteSpace($Password)) {
    throw "Losenord kravs."
  }
  $hash = Get-PasswordHash $Password
  $content = $content.Replace("REPLACE_WITH_PASSWORD_HASH", $hash)
  Write-Utf8NoBom $UserData $content
  Write-Host "Password-hash sparad i user-data."
} else {
  Write-Utf8NoBom $UserData $content
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
  Write-Host "Hoppar over ISO (-SkipIso). Packa mappen cidata till ISO med volymetikett CIDATA (t.ex. ImgBurn)."
  exit 0
}

function Test-WslReady {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) { return $false }
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & wsl -l 2>&1
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { return $false }
    $text = ($out | Out-String)
    if ($text -match "har inte installerats|is not installed|no installed distributions") { return $false }
    return $true
  } catch {
    return $false
  }
}

function New-CidataIsoImapi {
  param([string]$SourceDir, [string]$DestIso)

  try {
    $fsi = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  } catch {
    return $false
  }

  try {
    # 1 = ISO9660, 2 = Joliet (needed for lowercase names like user-data)
    $fsi.FileSystemsToCreate = 3
    $fsi.VolumeName = "cidata"
    $fsi.Root.AddTree($SourceDir, $false)
    $result = $fsi.CreateResultImage()
    $stream = $result.ImageStream

    $bytes = New-Object byte[] $result.TotalBlocksSize
    $fs = [System.IO.File]::Open($DestIso, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $buf = New-Object byte[] (1024 * 1024)
      while ($true) {
        $read = $stream.Read($buf, 0, $buf.Length)
        if ($read -le 0) { break }
        $fs.Write($buf, 0, $read)
      }
    } finally {
      $fs.Close()
    }

    return (Test-Path $DestIso) -and ((Get-Item $DestIso).Length -gt 0)
  } catch {
    Write-Host "IMAPI2 misslyckades: $($_.Exception.Message)"
    if (Test-Path $DestIso) { Remove-Item -Force $DestIso }
    return $false
  } finally {
    if ($stream) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream) }
    if ($result) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($result) }
    if ($fsi) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($fsi) }
  }
}

function New-CidataIso {
  param([string]$SourceDir, [string]$DestIso)

  # 1) Native Windows IMAPI2 (no extra installs)
  if (New-CidataIsoImapi -SourceDir $SourceDir -DestIso $DestIso) { return $true }

  # 2) WSL genisoimage / mkisofs / xorriso (only if WSL is actually ready)
  if (Test-WslReady) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $wslDir = (& wsl wslpath -a ($SourceDir -replace '\\', '/')) 2>$null
      $wslIso = (& wsl wslpath -a ($DestIso -replace '\\', '/')) 2>$null
      if ($wslDir -and $wslIso) {
        $cmds = @(
          "genisoimage -output `"$wslIso`" -volid cidata -joliet -rock `"$wslDir`"",
          "mkisofs -output `"$wslIso`" -volid cidata -joliet -rock `"$wslDir`"",
          "xorriso -as mkisofs -o `"$wslIso`" -V cidata -J -R `"$wslDir`""
        )
        foreach ($cmd in $cmds) {
          & wsl bash -lc $cmd 2>$null
          if ($LASTEXITCODE -eq 0 -and (Test-Path $DestIso)) { return $true }
        }
      }
    } finally {
      $ErrorActionPreference = $prev
    }
  }

  # 3) Windows ADK oscdimg
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
  Write-Host "Kunde inte skapa ISO automatiskt. Seed-mappen ar klar:"
  Write-Host "  $Stage"
  Write-Host ""
  Write-Host "Skapa ISO manuellt med ImgBurn (gratis):"
  Write-Host "  1. Mode -> Build"
  Write-Host "  2. Lagg till innehallet i cidata-mappen (valj filerna, inte mappen som enda rot)"
  Write-Host "  3. Options -> Volume Label = cidata"
  Write-Host "  4. Spara som localretail-cidata.iso i out\"
  exit 0
}

Write-Host ""
Write-Host "Nasta steg (Windows):"
Write-Host "  1. Installera Ventoy pa USB: https://www.ventoy.net/"
Write-Host "  2. Ladda ner Ubuntu 24.04 Server ISO (amd64)"
Write-Host "  3. Kopiera till Ventoy-USB:n:"
Write-Host "       - ubuntu-24.04*-live-server-amd64.iso"
Write-Host "       - $Iso"
Write-Host "  4. Boota USB pa kassadatorn och valj Ubuntu Server-ISO:n"
