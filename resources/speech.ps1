# Listening for Elysium's mic buttons, with Windows' own speech recognition.
# Reads "start" and "stop" lines on stdin and writes one JSON line per event:
# ready, listening, text (a finished phrase), idle, error. Nothing is recorded or kept.
$ErrorActionPreference = 'Stop'
function Say($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 2 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' -and $_.GetParameters()[1].ParameterType.Name -eq 'CancellationToken' })[0]
  $null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $rec = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer
  $none = New-Object System.Threading.CancellationTokenSource
  $c = $asTask.MakeGenericMethod([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult]).Invoke($null, @($rec.CompileConstraintsAsync(), $none.Token))
  $c.Wait(-1) | Out-Null
  $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
} catch { Say @{ t = 'error'; code = 'unavailable'; message = $_.Exception.Message }; exit 1 }
Say @{ t = 'ready' }

# Console.In reads synchronously even when asked to wait; a stream reader really waits in the background.
$in = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$line = $in.ReadLineAsync()
while ($true) {
  if (-not $line.Wait(200)) { continue }
  $cmd = $line.Result
  if ($null -eq $cmd) { break }
  $line = $in.ReadLineAsync()
  if ($cmd -ne 'start') { continue }
  Say @{ t = 'listening' }
  $on = $true
  while ($on) {
    $cts = New-Object System.Threading.CancellationTokenSource
    try { $task = $asTask.MakeGenericMethod([Windows.Media.SpeechRecognition.SpeechRecognitionResult]).Invoke($null, @($rec.RecognizeAsync(), $cts.Token)) }
    catch { $m = "$($_.Exception.Message)"; Say @{ t = 'error'; code = $(if ($m -match 'privacy') { 'privacy' } elseif ($m -match 'microphone|audio|capture') { 'microphone' } else { 'failed' }); message = $m }; break }
    while (-not $task.IsCompleted) {
      if ($line.IsCompleted) {
        $next = $line.Result
        if ($null -ne $next) { $line = $in.ReadLineAsync() }
        if ($null -eq $next -or $next -eq 'stop') { $cts.Cancel(); $on = $false }
      }
      $null = $task.Wait(120)
    }
    if ($task.IsCanceled) { break }
    if ($task.IsFaulted) {
      $m = $task.Exception.InnerException.Message
      $code = if ($m -match 'privacy') { 'privacy' } elseif ($m -match 'microphone|audio|capture') { 'microphone' } else { 'failed' }
      Say @{ t = 'error'; code = $code; message = $m }
      break
    }
    $res = $task.Result
    if ($res.Text) { Say @{ t = 'text'; text = $res.Text } }
    # Long silence ends listening on its own.
    elseif ($res.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) { break }
  }
  Say @{ t = 'idle' }
}
