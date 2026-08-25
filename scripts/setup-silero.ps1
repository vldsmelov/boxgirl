param(
    [switch]$SkipComparison,
    [switch]$ForceModelDownload
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sileroRoot = Join-Path $projectRoot "models\silero"
$venvRoot = Join-Path $sileroRoot ".venv"
$python = Join-Path $venvRoot "Scripts\python.exe"
$model = Join-Path $sileroRoot "v5_5_ru.pt"
$modelUrl = "https://models.silero.ai/models/tts/ru/v5_5_ru.pt"

New-Item -ItemType Directory -Force -Path $sileroRoot | Out-Null
$createdVenv = $false
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    & py -3.13 -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw "Python 3.13 venv creation failed" }
    $createdVenv = $true
}

if ($createdVenv) {
    & $python -m pip install --disable-pip-version-check --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
}
& $python -c "import torch, numpy" 2>$null
if ($LASTEXITCODE -ne 0) {
    & $python -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu torch numpy
    if ($LASTEXITCODE -ne 0) { throw "PyTorch CPU installation failed" }
}

if ($ForceModelDownload -or -not (Test-Path -LiteralPath $model -PathType Leaf)) {
    $partial = "$model.partial"
    & curl.exe --fail --location --retry 3 --continue-at - --output $partial $modelUrl
    if ($LASTEXITCODE -ne 0) { throw "Silero model download failed" }
    if ((Get-Item -LiteralPath $partial).Length -lt 1MB) {
        throw "Downloaded Silero model is unexpectedly small"
    }
    Move-Item -LiteralPath $partial -Destination $model -Force
}

& $python -c "import torch, numpy; print('Silero runtime:', torch.__version__, 'CPU threads:', torch.get_num_threads())"
if ($LASTEXITCODE -ne 0) { throw "Silero runtime smoke test failed" }

if (-not $SkipComparison) {
    & (Join-Path $PSScriptRoot "build-voice-comparison.ps1") -PythonPath $python -ModelPath $model
}

Write-Host "Silero v5.5 is ready at $sileroRoot"
