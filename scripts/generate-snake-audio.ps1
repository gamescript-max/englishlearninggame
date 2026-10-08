$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/audio'))
$taskManifestPath = Join-Path $taskDirectory 'manifest.json'
$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$taskLine = '听英语，看看完整句子。用方向按钮控制小蛇，吃到正确的图片。撞到边缘可以重新出发。'
$taskSynth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $taskSynth.SelectVoice('Microsoft Huihui Desktop')
  $taskSynth.Rate = 0
  $taskSynth.Volume = 90
  $taskFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $taskSynth.SetOutputToWaveFile((Join-Path $taskDirectory 'zh-033.wav'), $taskFormat)
  $taskSynth.Speak($taskLine)
  $taskSynth.SetOutputToNull()
} finally { $taskSynth.Dispose() }
$taskManifest.speech.zh | Add-Member -MemberType NoteProperty -Name $taskLine -Value '/audio/zh-033.wav' -Force
$taskJson = $taskManifest | ConvertTo-Json -Depth 8
$taskEncoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($taskManifestPath, $taskJson, $taskEncoding)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '../lib/audio-manifest.json'), $taskJson, $taskEncoding)
Write-Output 'Generated fixed Chinese snake instructions and synchronized audio indexes.'
