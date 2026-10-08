param(
  [string]$Python = 'C:/Users/LEGION/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
)
$ErrorActionPreference = 'Stop'
& $Python -m pip install --disable-pip-version-check --target (Join-Path $PSScriptRoot 'dependencies') 'edge-tts==7.2.8' 'imageio-ffmpeg==0.6.0' 'numpy==2.3.5'
if ($LASTEXITCODE -ne 0) { throw 'Asset dependency installation failed.' }
