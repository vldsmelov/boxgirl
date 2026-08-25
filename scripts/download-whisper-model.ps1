[CmdletBinding()]
param(
    [ValidateSet('tiny', 'base', 'small')]
    [string]$Model = 'base'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$modelDirectory = Join-Path $projectRoot 'models\whisper'
$modelPath = Join-Path $modelDirectory "ggml-$Model.bin"
$downloadUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$Model.bin"

New-Item -ItemType Directory -Path $modelDirectory -Force | Out-Null
if (Test-Path -LiteralPath $modelPath) {
    Write-Host "Model already exists: $modelPath"
    exit 0
}

Write-Host "Downloading whisper.cpp model '$Model'..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $modelPath

Write-Host "Saved: $modelPath"
Write-Host "Place whisper-cli.exe from whisper.cpp next to the model."
