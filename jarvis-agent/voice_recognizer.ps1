param (
    [string]$Mode = "single",
    [int]$TimeoutSeconds = 8,
    [string]$WakeWords = "jennifer,hey jennifer,jarvis,hey jarvis,computer"
)

Add-Type -AssemblyName System.Speech

# Set UTF-8 encoding for reliable IPC communication
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$engine = $null

function Build-AssistantGrammar([System.Speech.Recognition.SpeechRecognitionEngine]$eng, [string]$wakeCsv) {
    # Parse wake words
    $wakeList = @()
    if (-not [string]::IsNullOrWhiteSpace($wakeCsv)) {
        foreach ($w in $wakeCsv.Split(",")) {
            $t = $w.Trim().ToLower()
            if ($t.Length -gt 0) {
                $wakeList += $t
            }
        }
    }
    if ($wakeList.Count -eq 0) {
        $wakeList = @("jennifer", "hey jennifer", "jarvis")
    }

    $wakeChoices = New-Object System.Speech.Recognition.Choices
    $wakeChoices.Add([string[]]$wakeList)

    # Common command phrases and queries
    $sentenceList = @(
        # Time & Date
        "what time is it", "what is the time", "tell me the time", "current time", "what time", "clock",
        "what date is it", "what is the date", "today date", "what is today", "what day is it", "what day is today",
        
        # Weather
        "what is the weather", "how is the weather", "weather forecast", "weather today",
        "what is the temperature", "is it raining", "temperature outside",
        "weather in delhi", "weather in mumbai", "weather in bangalore", "weather in london", "weather in new york",
        
        # Web & Sites
        "open youtube", "open google", "open github", "open chat gpt", "open chatgpt", "open netflix", "open spotify",
        "open twitter", "open reddit", "open whatsapp", "open instagram", "open linkedin", "open gmail", "open amazon",
        "open flipkart", "open maps", "open wikipedia", "open calculator", "open notepad",
        
        # Media & Music
        "play music", "play a song", "play some music", "listen to music", "stop music", "pause music", "next song",
        
        # Entertainment & Motivation
        "tell me a joke", "tell a joke", "make me laugh", "say something funny", "tell me another joke",
        "give me a quote", "inspire me", "motivate me", "tell me a motivational quote",
        "tell me a fun fact", "tell me a fact", "interesting fact", "did you know", "trivia",
        
        # System & Hardware
        "system info", "show system info", "system status", "computer specs", "cpu usage", "ram usage", "memory usage",
        
        # Assistant & Control
        "who are you", "what is your name", "introduce yourself", "what are you",
        "what can you do", "help me", "show help", "capabilities",
        "clear chat", "clear screen", "reset chat",
        "mute", "unmute", "stop talking", "mute voice", "unmute voice",
        "exit", "close", "shutdown", "goodbye", "bye",
        
        # Greetings
        "hello", "hello jennifer", "hi jennifer", "good morning", "good afternoon", "good evening", "greetings", "hey there"
    )

    $sentenceChoices = New-Object System.Speech.Recognition.Choices
    $sentenceChoices.Add([string[]]$sentenceList)

    # Action verbs
    $verbChoices = New-Object System.Speech.Recognition.Choices
    $verbChoices.Add([string[]]@("open", "launch", "start", "search for", "google", "find", "show me", "what is", "calculate", "play"))

    # Targets
    $targetChoices = New-Object System.Speech.Recognition.Choices
    $targetChoices.Add([string[]]@("youtube", "google", "github", "wikipedia", "spotify", "netflix", "weather", "news", "calculator", "music", "specs"))

    # 1. Wake word alone: "Jennifer"
    $ruleWakeAlone = New-Object System.Speech.Recognition.GrammarBuilder($wakeChoices)

    # 2. Sentences directly: "what time is it", "open youtube"
    $ruleSentences = New-Object System.Speech.Recognition.GrammarBuilder($sentenceChoices)

    # 3. Wake word + Sentence: "Jennifer what time is it", "Hey Jennifer open youtube"
    $ruleWakeThenSentence = New-Object System.Speech.Recognition.GrammarBuilder
    $ruleWakeThenSentence.Append($wakeChoices)
    $ruleWakeThenSentence.Append($sentenceChoices)

    # 4. Action + Target: "open youtube", "search for weather"
    $ruleActionTarget = New-Object System.Speech.Recognition.GrammarBuilder
    $ruleActionTarget.Append($verbChoices)
    $ruleActionTarget.Append($targetChoices)

    # 5. Wake word + Action + Target: "Jennifer open youtube"
    $ruleWakeActionTarget = New-Object System.Speech.Recognition.GrammarBuilder
    $ruleWakeActionTarget.Append($wakeChoices)
    $ruleWakeActionTarget.Append($verbChoices)
    $ruleWakeActionTarget.Append($targetChoices)

    # Combine all into primary grammar
    $allRules = New-Object System.Speech.Recognition.Choices
    $allRules.Add([System.Speech.Recognition.GrammarBuilder[]]@(
        $ruleWakeAlone,
        $ruleSentences,
        $ruleWakeThenSentence,
        $ruleActionTarget,
        $ruleWakeActionTarget
    ))

    $mainBuilder = New-Object System.Speech.Recognition.GrammarBuilder($allRules)
    $cmdGrammar = New-Object System.Speech.Recognition.Grammar($mainBuilder)
    $cmdGrammar.Name = "CommandGrammar"
    $cmdGrammar.Priority = 1
    $cmdGrammar.Weight = 1.0
    $eng.LoadGrammar($cmdGrammar)

    # Freeform dictation grammar with lower weight as fallback
    try {
        $dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
        $dictationGrammar.Name = "DictationGrammar"
        $dictationGrammar.Weight = 0.2
        $eng.LoadGrammar($dictationGrammar)
    } catch {
        # Dictation fallback optional
    }
}

try {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    Build-AssistantGrammar -eng $engine -wakeCsv $WakeWords
    $engine.SetInputToDefaultAudioDevice()

    if ($Mode -eq "continuous") {
        Write-Output "STATUS:READY"
        Write-Output "STATUS:LISTENING"

        $engine.add_SpeechRecognized({
            param($sender, $e)
            if ($null -ne $e.Result -and -not [string]::IsNullOrWhiteSpace($e.Result.Text)) {
                $conf = [math]::Round($e.Result.Confidence * 100)
                $txt = $e.Result.Text
                [Console]::WriteLine("STATUS:RESULT:" + $txt + ":" + $conf)
            }
        })

        $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

        # Keep alive and wait for exit command on stdin
        while ($true) {
            $line = [Console]::ReadLine()
            if ($null -eq $line -or $line.Trim() -eq "QUIT" -or $line.Trim() -eq "STOP") {
                break
            }
        }

        try { $engine.RecognizeAsyncStop() } catch {}
    } else {
        # Single-shot mode
        Write-Output "STATUS:LISTENING"
        $result = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))

        if ($null -ne $result -and -not [string]::IsNullOrWhiteSpace($result.Text)) {
            $conf = [math]::Round($result.Confidence * 100)
            Write-Output "CONFIDENCE:$conf"
            Write-Output "RESULT:$($result.Text)"
        } else {
            Write-Output "STATUS:NO_SPEECH"
        }
    }
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
} finally {
    if ($null -ne $engine) {
        try { $engine.Dispose() } catch {}
    }
    Write-Output "STATUS:DONE"
}
