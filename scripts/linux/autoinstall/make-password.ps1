# Generates a SHA-512 password hash for autoinstall user-data.
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Password
)

function Get-PasswordHash([string]$Plain) {
  $openssl = @(
    "openssl",
    "$env:ProgramFiles\Git\usr\bin\openssl.exe",
    "${env:ProgramFiles(x86)}\Git\usr\bin\openssl.exe"
  ) | Where-Object { $_ -eq "openssl" -or (Test-Path $_) } | Select-Object -First 1

  if ($openssl) {
    if ($openssl -eq "openssl") {
      $hash = & openssl passwd -6 $Plain 2>$null
    } else {
      $hash = & $openssl passwd -6 $Plain 2>$null
    }
    if ($LASTEXITCODE -eq 0 -and $hash) { return $hash.Trim() }
  }

  if (Get-Command wsl -ErrorAction SilentlyContinue) {
    $hash = wsl openssl passwd -6 $Plain 2>$null
    if ($LASTEXITCODE -eq 0 -and $hash) { return ($hash | Select-Object -Last 1).ToString().Trim() }
  }

  throw "Hittade ingen openssl. Installera Git for Windows eller aktivera WSL."
}

Get-PasswordHash $Password
