param(
    [string]$PythonPath = "",
    [string]$ModelPath = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PythonPath) { $PythonPath = Join-Path $projectRoot "models\silero\.venv\Scripts\python.exe" }
if (-not $ModelPath) { $ModelPath = Join-Path $projectRoot "models\silero\v5_5_ru.pt" }
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot "artifacts\qa\voice-comparison" }
$phrasesPath = Join-Path $PSScriptRoot "voice-comparison-phrases.json"

foreach ($required in @($PythonPath, $ModelPath, $phrasesPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required file not found: $required"
    }
}

$irinaPath = Join-Path $OutputPath "irina"
New-Item -ItemType Directory -Force -Path $irinaPath | Out-Null
$phrases = Get-Content -LiteralPath $phrasesPath -Raw -Encoding UTF8 | ConvertFrom-Json

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $irina = $synth.GetInstalledVoices() |
        Where-Object { $_.VoiceInfo.Name -match "Irina" -or $_.VoiceInfo.Culture.Name -eq "ru-RU" } |
        Select-Object -First 1
    if (-not $irina) { throw "No Russian Windows SAPI voice is installed" }
    $synth.SelectVoice($irina.VoiceInfo.Name)
    $synth.Rate = 0
    $synth.Volume = 100
    foreach ($phrase in $phrases) {
        $target = Join-Path $irinaPath ($phrase.id + ".wav")
        $synth.SetOutputToWaveFile($target)
        $synth.Speak([string]$phrase.text)
        $synth.SetOutputToNull()
    }
}
finally {
    $synth.Dispose()
}

& $PythonPath (Join-Path $PSScriptRoot "generate_voice_comparison.py") `
    --model $ModelPath `
    --phrases $phrasesPath `
    --output $OutputPath `
    --threads 4
if ($LASTEXITCODE -ne 0) { throw "Silero comparison generator failed with exit code $LASTEXITCODE" }

Write-Host "Voice comparison ready: $OutputPath"
