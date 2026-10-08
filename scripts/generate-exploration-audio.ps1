$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$taskAudioDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/audio'))
$taskManifestPath=Join-Path $taskAudioDirectory 'manifest.json'
$taskManifest=Get-Content -LiteralPath $taskManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$taskGuides=@(
 '听英语，找到两颗一样的目标泡泡。点破泡泡，就能收集宝藏。',
 '听英语，把要送的图卡装进托盘。装满规定的份数，再送给乐乐。点托盘里的图卡可以拿回来。',
 '听英语，先点正在学习的英文词，再点它的图片。连好三条线，就能去下一组。'
)
$taskSynth=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
 $taskSynth.SelectVoice('Microsoft Huihui Desktop'); $taskSynth.Rate=0; $taskSynth.Volume=90
 $taskFormat=[System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
 for($taskIndex=0;$taskIndex -lt $taskGuides.Count;$taskIndex++) {
  $taskFileName='zh-{0:D3}.wav' -f (34+$taskIndex)
  $taskSynth.SetOutputToWaveFile((Join-Path $taskAudioDirectory $taskFileName),$taskFormat)
  $taskSynth.Speak($taskGuides[$taskIndex]); $taskSynth.SetOutputToNull()
  $taskManifest.speech.zh | Add-Member -MemberType NoteProperty -Name $taskGuides[$taskIndex] -Value ('/audio/'+$taskFileName) -Force
 }
} finally {$taskSynth.Dispose()}
$taskJson=$taskManifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($taskManifestPath,$taskJson,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '../lib/audio-manifest.json'),$taskJson,[Text.UTF8Encoding]::new($false))
Write-Output 'Generated three Chinese game guides and synchronized manifests.'