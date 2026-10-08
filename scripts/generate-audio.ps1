param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '../public/audio')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskAudioOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $taskAudioOutput -Force | Out-Null

$taskCoreWords = @(
  'cat', 'dog', 'bird', 'fish', 'frog', 'duck', 'horse', 'rabbit',
  'apple', 'banana', 'orange', 'bread', 'milk', 'water', 'juice', 'cake',
  'ball', 'doll', 'kite', 'robot', 'bike', 'train', 'teddy bear', 'toy car'
)
$taskEnglish = [System.Collections.Generic.List[string]]::new()
foreach ($taskWord in $taskCoreWords + @('red', 'blue', 'green', 'yellow', 'one', 'two', 'three', 'in', 'on', 'under')) {
  $taskEnglish.Add($taskWord)
}
foreach ($taskWord in $taskCoreWords) {
  $taskEnglish.Add("Listen and find the $taskWord.")
  $taskEnglish.Add("Find the $taskWord.")
  $taskEnglish.Add("Put the $taskWord in the box.")
  $taskEnglish.Add("Put the $taskWord on the table.")
  $taskEnglish.Add("Put the $taskWord under the table.")
}
foreach ($taskSentence in @(
  'It is a cat.', 'I can see two dogs.', 'The bird is blue.',
  'I like apples.', 'Can I have some water, please?', 'Here you are.',
  'This is my ball.', 'Put the ball in the box.', 'The teddy bear is under the table.'
)) { $taskEnglish.Add($taskSentence) }

$taskChinese = @(
  '你好，我是小狐狸乐乐。我们一起去探险吧！',
  '听一听，找到图片，点一下。',
  '看单词，找到对应的图片。',
  '先点物品，再点要放的位置。也可以拖过去。',
  '答对啦！',
  '再听一次，你可以的！',
  '跟着读一读吧。',
  '完成啦！',
  '录音时，请说英语。完成后点停止。',
  '准备好了吗？点击开始，我们一起去探险！',
  '先听小狐狸读一遍，再开始游戏。',
  '点小喇叭，可以再听一次。',
  '真棒！你得到了一颗星星。',
  '今天的复习完成啦！',
  '我们去认识动物朋友吧！',
  '我们给小狐狸准备好吃的吧！',
  '我们一起整理玩具小屋吧！',
  '没关系，我们再试一次。',
  '看看发光的图片，再试一试。',
  '看看发光的位置，再试一试。',
  '点击录音，试着读一读。',
  '点击播放，听听自己的声音。',
  '可以跳过录音，继续探险。',
  '先选一个物品。',
  '把物品放到盒子里面。',
  '把物品放到桌子上面。',
  '把物品放到桌子下面。',
  '今天已经学习很久啦，休息一下眼睛吧。',
  '请家长帮助设置声音和麦克风。',
  '先看看图片，记住位置。卡片盖上后，听声音，翻开正确的那张。',
  '听一听，把字母按顺序排好。点字母就能放进去，排好后点检查。',
  '听一句英语，看看图片，选出意思一样的那一张。',
  '听英语，看看完整句子。用方向按钮控制小蛇，吃到正确的图片。撞到边缘可以重新出发。',
  '听英语，找到两颗一样的目标泡泡。点破泡泡，就能收集宝藏。',
  '听英语，把要送的图卡装进托盘。装满规定的份数，再送给乐乐。点托盘里的图卡可以拿回来。',
  '听英语，先点正在学习的英文词，再点它的图片。连好三条线，就能去下一组。'
)

$taskManifest = [ordered]@{
  version = 1
  defaultAccent = 'en-US'
  provenance = [ordered]@{
    englishVoice = 'Microsoft Zira Desktop'
    chineseVoice = 'Microsoft Huihui Desktop'
    engine = 'Windows System.Speech.Synthesis'
    format = 'PCM WAV, mono, 22050 Hz, 16 bit'
    englishRate = -1
    chineseRate = 0
    note = 'Original locally synthesized teaching audio. Effects and music are original mathematical synthesis.'
  }
  speech = [ordered]@{ en = [ordered]@{}; zh = [ordered]@{} }
  effects = [ordered]@{
    correct = '/audio/effect-correct.wav'
    retry = '/audio/effect-retry.wav'
    reward = '/audio/effect-reward.wav'
  }
  music = '/audio/music-loop.wav'
}

$taskFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
  22050,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$taskSynth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  foreach ($taskLanguage in @('en', 'zh')) {
    $taskVoiceName = if ($taskLanguage -eq 'en') { 'Microsoft Zira Desktop' } else { 'Microsoft Huihui Desktop' }
    $taskTexts = if ($taskLanguage -eq 'en') { $taskEnglish } else { $taskChinese }
    $taskSynth.SelectVoice($taskVoiceName)
    $taskSynth.Rate = if ($taskLanguage -eq 'en') { -1 } else { 0 }
    $taskSynth.Volume = 90
    $taskSeen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $taskIndex = 0
    foreach ($taskText in $taskTexts) {
      if (-not $taskSeen.Add($taskText)) { continue }
      $taskIndex++
      $taskFilename = '{0}-{1:D3}.wav' -f $taskLanguage, $taskIndex
      $taskPath = Join-Path $taskAudioOutput $taskFilename
      $taskSynth.SetOutputToWaveFile($taskPath, $taskFormat)
      $taskSynth.Speak($taskText)
      $taskSynth.SetOutputToNull()
      $taskManifest.speech[$taskLanguage][$taskText] = "/audio/$taskFilename"
    }
    Write-Output "Generated $taskIndex $taskLanguage speech clips with $taskVoiceName."
  }
} finally { $taskSynth.Dispose() }

if (-not ('EnglishIslandAudioSynthesis' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
public static class EnglishIslandAudioSynthesis {
  private const int SampleRate = 22050;
  private static double Tone(double frequency, double time) {
    return Math.Sin(2 * Math.PI * frequency * time) + 0.16 * Math.Sin(4 * Math.PI * frequency * time);
  }
  private static void Wave(string path, int count, Func<int, double> sample) {
    using (var stream = File.Create(path)) using (var writer = new BinaryWriter(stream)) {
      writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + count * 2);
      writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
      writer.Write((short)1); writer.Write((short)1); writer.Write(SampleRate);
      writer.Write(SampleRate * 2); writer.Write((short)2); writer.Write((short)16);
      writer.Write(System.Text.Encoding.ASCII.GetBytes("data")); writer.Write(count * 2);
      for (int i = 0; i < count; i++) writer.Write((short)(Math.Max(-1, Math.Min(1, sample(i))) * 32767));
    }
  }
  public static void Effect(string path, double[] notes, double noteDuration) {
    int count = (int)((notes.Length * noteDuration + .15) * SampleRate);
    Wave(path, count, i => {
      double time = i / (double)SampleRate;
      int note = (int)(time / noteDuration);
      if (note >= notes.Length) return 0;
      double local = time - note * noteDuration;
      double envelope = Math.Min(1, local / .015) * Math.Exp(-local * 9) * Math.Min(1, (noteDuration - local) / .03);
      return .24 * envelope * Tone(notes[note], local);
    });
  }
  public static void Music(string path) {
    // Original sparse pentatonic melody; exact-length bar loop with soft attack/release.
    double beat = .5;
    double[] melody = { 523.25, 0, 659.25, 0, 783.99, 0, 659.25, 0, 587.33, 0, 659.25, 0, 523.25, 0, 0, 0,
                        440.00, 0, 523.25, 0, 659.25, 0, 587.33, 0, 523.25, 0, 440.00, 0, 523.25, 0, 0, 0 };
    int count = (int)(melody.Length * beat * SampleRate);
    Wave(path, count, i => {
      double time = i / (double)SampleRate;
      int note = (int)(time / beat);
      double local = time - note * beat;
      double envelope = Math.Min(1, local / .025) * Math.Exp(-local * 6) * Math.Min(1, (beat - local) / .08);
      double voice = melody[note] == 0 ? 0 : .09 * envelope * Tone(melody[note], local);
      return voice;
    });
  }
}
'@
}
[EnglishIslandAudioSynthesis]::Effect((Join-Path $taskAudioOutput 'effect-correct.wav'), @(523.25, 659.25, 783.99), .13)
[EnglishIslandAudioSynthesis]::Effect((Join-Path $taskAudioOutput 'effect-retry.wav'), @(392.00, 440.00), .16)
[EnglishIslandAudioSynthesis]::Effect((Join-Path $taskAudioOutput 'effect-reward.wav'), @(523.25, 659.25, 783.99, 1046.50), .18)
[EnglishIslandAudioSynthesis]::Music((Join-Path $taskAudioOutput 'music-loop.wav'))
$taskManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskAudioOutput 'manifest.json') -Encoding utf8
$taskDefaultOutput = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/audio'))
if ($taskAudioOutput -eq $taskDefaultOutput) {
  Copy-Item -LiteralPath (Join-Path $taskAudioOutput 'manifest.json') -Destination (Join-Path $PSScriptRoot '../lib/audio-manifest.json')
}
Write-Output 'Generated three original effects, a 16-second music loop, and manifest.json.'
