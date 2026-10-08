$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskAudioDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/audio'))
$taskManifestPath = Join-Path $taskAudioDirectory 'manifest.json'
$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$taskLines = @(
  '先看看图片，记住位置。卡片盖上后，听声音，翻开正确的那张。',
  '听一听，把字母按顺序排好。点字母就能放进去，排好后点检查。',
  '听一句英语，看看图片，选出意思一样的那一张。'
)
$taskFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$taskSynth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $taskSynth.SelectVoice('Microsoft Huihui Desktop')
  $taskSynth.Rate = 0
  $taskSynth.Volume = 90
  for ($taskIndex = 0; $taskIndex -lt $taskLines.Count; $taskIndex++) {
    $taskFilename = 'zh-{0:d3}.wav' -f ($taskIndex + 30)
    $taskSynth.SetOutputToWaveFile((Join-Path $taskAudioDirectory $taskFilename), $taskFormat)
    $taskSynth.Speak($taskLines[$taskIndex])
    $taskSynth.SetOutputToNull()
    $taskManifest.speech.zh | Add-Member -MemberType NoteProperty -Name $taskLines[$taskIndex] -Value ('/audio/' + $taskFilename) -Force
  }
} finally { $taskSynth.Dispose() }
$taskJson = $taskManifest | ConvertTo-Json -Depth 8
$taskEncoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($taskManifestPath, $taskJson, $taskEncoding)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '../lib/audio-manifest.json'), $taskJson, $taskEncoding)
Write-Output 'Generated 3 fixed Chinese game instructions and synchronized both audio indexes.'
