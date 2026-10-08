param(
  [string]$Python = 'C:/Users/LEGION/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  [switch]$InstallDependencies
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'effects') -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'sources/effects') -Filter '*.wav' | Copy-Item -Destination (Join-Path $PSScriptRoot 'effects') -Force
if ($InstallDependencies) {
  & (Join-Path $PSScriptRoot 'install-dependencies.ps1') -Python $Python
}
& $Python (Join-Path $PSScriptRoot 'generate-speech.py') --reconvert --concurrency 2
if ($LASTEXITCODE -ne 0) { throw 'Neural speech regeneration failed.' }
& $Python (Join-Path $PSScriptRoot 'compose-music.py')
if ($LASTEXITCODE -ne 0) { throw 'Original music composition failed.' }
& $Python (Join-Path $PSScriptRoot 'verify-assets.py')
if ($LASTEXITCODE -ne 0) { throw 'Audio asset verification failed.' }
