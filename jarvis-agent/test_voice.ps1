Add-Type -AssemblyName System.Speech
try {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $grammar = New-Object System.Speech.Recognition.DictationGrammar
    $engine.LoadGrammar($grammar)
    $engine.SetInputToDefaultAudioDevice()
    Write-Output "READY"
    $res = $engine.Recognize([TimeSpan]::FromSeconds(6))
    if ($res -and $res.Text) {
        Write-Output "RESULT:$($res.Text)"
    } else {
        Write-Output "NO_SPEECH"
    }
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
} finally {
    if ($engine) { $engine.Dispose() }
}
