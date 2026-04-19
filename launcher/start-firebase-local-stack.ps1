$ErrorActionPreference = "Stop"

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$rootLiteral = $rootDir.Path.Replace("'", "''")

function New-TaskPowerShellArgs {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Command
  )

  return @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-NoExit",
    "-Command",
    $Command
  )
}

$firebaseCommand = "Set-Location -LiteralPath '$rootLiteral'; `$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK='true'; firebase.cmd emulators:start --only auth,firestore"
$launcherCommand = "Set-Location -LiteralPath '$rootLiteral'; Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue; Remove-Item Env:VSCODE_INSPECTOR_OPTIONS -ErrorAction SilentlyContinue; `$env:APP_USE_FIREBASE_EMULATOR='true'; node .\launcher\launcher-server.cjs 8081"

Start-Process -FilePath "powershell.exe" -ArgumentList (New-TaskPowerShellArgs -Command $firebaseCommand) -WorkingDirectory $rootDir.Path
Start-Sleep -Seconds 2
Start-Process -FilePath "powershell.exe" -ArgumentList (New-TaskPowerShellArgs -Command $launcherCommand) -WorkingDirectory $rootDir.Path

Write-Host "Firebase Emulator and launcher startup commands were opened."
Write-Host "Emulator UI: http://127.0.0.1:4000"
Write-Host "Launcher window shows the exact app URL."
Write-Host "If port 8081 is busy, the emulator launcher may use 8082 or another port."
