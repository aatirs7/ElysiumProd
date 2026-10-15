# Elysium installer for Windows.
#
# Puts your own copy of Elysium's source in %LOCALAPPDATA%\Elysium\app, builds it,
# and adds Elysium to the Start menu and desktop. Your copy is yours: the built in
# "Customize Elysium" tool edits it, and Get updates in Settings pulls new versions
# without losing your changes.
#
# Run it with:
#   irm https://raw.githubusercontent.com/aatirs7/ElysiumProd/main/setup/install.ps1 | iex
# or double click "Install Elysium.cmd".

param(
  [string]$Repo = 'https://github.com/aatirs7/ElysiumProd.git',
  [string]$Branch = 'main',
  [string]$Dir = (Join-Path $env:LOCALAPPDATA 'Elysium\app'),
  # For testing the installer: no shortcut, and do not open the app at the end.
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installing Elysium'

function Say($text, $color = 'Gray') { Write-Host "  $text" -ForegroundColor $color }
function Step($n, $text) { Write-Host ''; Write-Host "  [$n/6] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "        OK  $text" -ForegroundColor Green }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function WingetInstall($id, $name) {
  if (-not (Have 'winget')) { throw "winget is missing. Install $name yourself, then run this again." }
  Say "Installing $name (this can take a minute)..."
  winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Null
  RefreshPath
}

Write-Host ''
Write-Host '  Elysium' -ForegroundColor White
Say 'One calm place to run all your projects with Claude.'

Step 1 'Git'
if (-not (Have 'git')) { WingetInstall 'Git.Git' 'Git' }
if (-not (Have 'git')) { throw 'Git did not install. Install it from git-scm.com and run this again.' }
Ok (git --version)

Step 2 'Node.js'
if (-not (Have 'node')) { WingetInstall 'OpenJS.NodeJS.LTS' 'Node.js' }
if (-not (Have 'node')) { throw 'Node.js did not install. Install the LTS from nodejs.org and run this again.' }
Ok "Node $(node --version)"

Step 3 'Claude Code'
if (-not (Have 'claude')) {
  Say 'Installing Claude Code...'
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  RefreshPath
  $local = Join-Path $env:USERPROFILE '.local\bin'
  if (Test-Path $local) { $env:Path = "$local;$env:Path" }
}
if (Have 'claude') { Ok 'Claude Code is installed. Elysium helps you sign in on first run.' } else { Say 'Claude Code will be offered again inside Elysium.' 'Yellow' }

Step 4 'Your copy of Elysium'
if (Test-Path (Join-Path $Dir '.git')) {
  Say "Updating $Dir ..."
  git -C $Dir pull --ff-only origin $Branch | Out-Null
} else {
  New-Item -ItemType Directory -Force (Split-Path $Dir) | Out-Null
  git clone --branch $Branch --depth 50 $Repo $Dir | Out-Null
}
# Their own changes live on a branch of their own, so updates merge into it cleanly.
Push-Location $Dir
try {
  if (-not (git branch --list mine)) { git checkout -q -b mine } else { git checkout -q mine }
  git config user.name  2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { git config user.name "$env:USERNAME" }
  git config user.email 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { git config user.email "$env:USERNAME@localhost" }
} finally { Pop-Location }
Ok $Dir

Step 5 'Building (two or three minutes the first time)'
Push-Location $Dir
try {
  npm ci --no-audit --no-fund --loglevel=error | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Run it in the folder above to see why.' }
  # npm sometimes skips Electron's own download; fetch it if the program is missing.
  if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) {
    node node_modules\electron\install.js | Out-Null
    if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) { throw 'Electron did not download. Check the connection and run this again.' }
  }
  npx electron-vite build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The build failed. Run "npx electron-vite build" in the folder above to see why.' }
} finally { Pop-Location }
Ok 'Built'

Step 6 'Shortcuts'
$electron = Join-Path $Dir 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $Dir 'resources\icon.ico'
$shell = New-Object -ComObject WScript.Shell
# The Start menu entry is made by Elysium itself, with its taskbar identity.
foreach ($where in @(if (-not $Quiet) { [Environment]::GetFolderPath('Desktop') })) {
  $lnk = $shell.CreateShortcut((Join-Path $where 'Elysium Development.lnk'))
  $lnk.TargetPath = $electron
  $lnk.Arguments = "`"$Dir`""
  $lnk.WorkingDirectory = $Dir
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Description = 'Elysium Development'
  $lnk.Save()
}
Ok 'Desktop shortcut; the Start menu entry appears when Elysium first opens'

Write-Host ''
Write-Host '  Elysium is ready. Opening it now.' -ForegroundColor Green
Write-Host ''
if (-not $Quiet) { Start-Process -FilePath $electron -ArgumentList "`"$Dir`"" -WorkingDirectory $Dir
 }
