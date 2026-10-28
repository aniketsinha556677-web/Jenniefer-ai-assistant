param (
    [int]$DurationSeconds = 6,
    [string]$OutputFile = "user_voice_sample.wav",
    [string]$WakeWords = "jennifer,hey jennifer,jarvis,computer"
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinmmAudio {
    [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi, SetLastError = true, ExactSpelling = true)]
    public static extern int mciSendString(string lpstrCommand, string lpstrReturnString, int uReturnLength, int hwndCallback);
}
"@

Add-Type -AssemblyName System.Speech

$wavPath = Join-Path $PSScriptRoot $OutputFile
if (Test-Path $wavPath) {
    Remove-Item $wavPath -Force -ErrorAction SilentlyContinue
}

Write-Host "=========================================================="
Write-Host "🎙 PREPARING MICROPHONE TO RECORD YOUR VOICE SAMPLE..."
Write-Host "=========================================================="

try {
    # Open MCI wave audio device
    [WinmmAudio]::mciSendString("open new type waveaudio alias recsound", "", 0, 0)
    [WinmmAudio]::mciSendString("set recsound time format ms", "", 0, 0)
    [WinmmAudio]::mciSendString("set recsound bitspersample 16", "", 0, 0)
    [WinmmAudio]::mciSendString("set recsound channels 1", "", 0, 0)
    [WinmmAudio]::mciSendString("set recsound samplespersec 16000", "", 0, 0)

    # Start Recording
    [WinmmAudio]::mciSendString("record recsound", "", 0, 0)
    Write-Host ""
    Write-Host "🔴 RECORDING NOW! PLEASE SPEAK INTO YOUR MIC FOR $DurationSeconds SECONDS:"
    Write-Host "👉 Say clearly: 'Hey Jennifer, what time is it?' or 'Open YouTube'"
    Write-Host ""

    for ($i = $DurationSeconds; $i -gt 0; $i--) {
        Write-Host "⏳ Time remaining: $i seconds... (Speaking...)"
        Start-Sleep -Seconds 1
    }

    Write-Host ""
    Write-Host "⏹ Recording finished! Saving audio..."
    $saveCmd = "save recsound " + [char]34 + $wavPath + [char]34
    [WinmmAudio]::mciSendString($saveCmd, "", 0, 0)
    [WinmmAudio]::mciSendString("close recsound", "", 0, 0)

    if (Test-Path $wavPath) {
        $fileInfo = Get-Item $wavPath
        Write-Host "✅ Audio file saved: $($fileInfo.Name) ($($fileInfo.Length) bytes)"
        
        # Check if the audio file contains actual sound or silence
        $bytes = [System.IO.File]::ReadAllBytes($wavPath)
        if ($bytes.Length -gt 44) {
            $samples = @()
            $maxSample = 0
            for ($i = 44; $i -lt [Math]::Min($bytes.Length - 1, 100000); $i += 2) {
                $sample = [BitConverter]::ToInt16($bytes, $i)
                $abs = [Math]::Abs($sample)
                if ($abs -gt $maxSample) { $maxSample = $abs }
            }
            $peakVolumePct = [Math]::Min(100, [Math]::Round(($maxSample / 32768.0) * 100))
            Write-Host "📊 Microphone Peak Volume: $peakVolumePct%"
            if ($peakVolumePct -lt 2) {
                Write-Host "⚠️ WARNING: Audio signal is very low (<2%). Your microphone may be muted in Windows or physical switch is off."
            } else {
                Write-Host "🔊 Microphone audio signal is healthy!"
            }
        }

        # Analyze audio with Speech Engine
        Write-Host ""
        Write-Host "🧠 Analyzing what Jennifer's speech engine hears from your voice..."

        $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine

        # Load Grammar
        $choices = New-Object System.Speech.Recognition.Choices
        $choices.Add([string[]]@(
            'jennifer', 'hey jennifer', 'jarvis', 'hey jarvis', 'computer',
            'what time is it', 'what is the time', 'current time',
            'what date is it', 'what is the date', 'today date',
            'what is the weather', 'how is the weather',
            'open youtube', 'open google', 'open github', 'open spotify',
            'tell me a joke', 'make me laugh',
            'play music', 'system info', 'who are you', 'help me'
        ))
        $gb = New-Object System.Speech.Recognition.GrammarBuilder($choices)
        $cmdGrammar = New-Object System.Speech.Recognition.Grammar($gb)
        $cmdGrammar.Weight = 1.0
        $engine.LoadGrammar($cmdGrammar)

        try {
            $dict = New-Object System.Speech.Recognition.DictationGrammar
            $dict.Weight = 0.3
            $engine.LoadGrammar($dict)
        } catch {}

        $engine.SetInputToWaveFile($wavPath)
        $result = $engine.Recognize([TimeSpan]::FromSeconds($DurationSeconds + 2))

        if ($null -ne $result -and -not [string]::IsNullOrWhiteSpace($result.Text)) {
            $conf = [Math]::Round($result.Confidence * 100)
            Write-Host "=========================================================="
            Write-Host ('🎯 RECOGNITION RESULT: ' + $result.Text)
            Write-Host ('⭐ CONFIDENCE SCORE: ' + $conf + '%')
            Write-Host "=========================================================="
        } else {
            Write-Host "=========================================================="
            Write-Host "❌ NO CLEAR WORDS RECOGNIZED IN AUDIO."
            Write-Host "Possible causes:"
            Write-Host "1. Microphone volume is too low or muted in Windows Sound Settings."
            Write-Host "2. Words spoken were not in the command list."
            Write-Host "=========================================================="
        }

        $engine.Dispose()
    } else {
        Write-Host "❌ Failed to save WAV file."
    }
} catch {
    Write-Host "❌ Error recording voice sample: $($_.Exception.Message)"
} finally {
    try { [WinmmAudio]::mciSendString("close recsound", "", 0, 0) } catch {}
}
