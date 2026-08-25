param(
    [switch]$SkipModelDownload,
    [switch]$SkipCudaRuntime,
    [switch]$ForceRuntimeDownload,
    [switch]$ForceCudaRuntimeDownload,
    [switch]$ForceModelDownload
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$llmRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "models\llm"))
if (-not $llmRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved LLM directory escaped the project root"
}

$runtimeRoot = Join-Path $llmRoot "runtime"
$server = Join-Path $runtimeRoot "llama-server.exe"
$cudaRuntimeRoot = Join-Path $llmRoot "runtime-cuda"
$cudaServer = Join-Path $cudaRuntimeRoot "llama-server.exe"
$model = Join-Path $llmRoot "Qwen3.5-4B-Q4_K_M.gguf"
$runtimeVersion = "b10603"
$runtimeArchive = Join-Path $llmRoot "llama-$runtimeVersion-bin-win-cpu-x64.zip"
$runtimeUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$runtimeVersion/llama-$runtimeVersion-bin-win-cpu-x64.zip"
$runtimeSha256 = "878efa5bc0cdeb9c3fcb96335521556e06ca9252f83de3a1d924981918607702"
$cudaArchive = Join-Path $llmRoot "llama-$runtimeVersion-bin-win-cuda-12.4-x64.zip"
$cudaUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$runtimeVersion/llama-$runtimeVersion-bin-win-cuda-12.4-x64.zip"
$cudaSha256 = "1fdc908106116bc4dfd744c769ca63bdb9268062c1762f4439ef65261ec5efe3"
$cudaLibrariesArchive = Join-Path $llmRoot "cudart-llama-bin-win-cuda-12.4-x64.zip"
$cudaLibrariesUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$runtimeVersion/cudart-llama-bin-win-cuda-12.4-x64.zip"
$cudaLibrariesSha256 = "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6"
$modelUrl = "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf?download=true"
$modelSha256 = "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"

function Assert-Sha256([string]$Path, [string]$Expected) {
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        throw "SHA-256 mismatch for $Path. Expected $Expected, got $actual"
    }
}

function Install-Archive(
    [string]$Archive,
    [string]$Url,
    [string]$Sha256,
    [string]$Destination,
    [bool]$Force
) {
    $partialArchive = "$Archive.partial"
    if ($Force) {
        & curl.exe --fail --location --retry 3 --output $partialArchive $Url
    }
    else {
        & curl.exe --fail --location --retry 3 --continue-at - --output $partialArchive $Url
    }
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    Assert-Sha256 $partialArchive $Sha256
    Move-Item -LiteralPath $partialArchive -Destination $Archive -Force
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}

New-Item -ItemType Directory -Force -Path $llmRoot, $runtimeRoot, $cudaRuntimeRoot | Out-Null
if ($ForceRuntimeDownload -or -not (Test-Path -LiteralPath $server -PathType Leaf)) {
    Install-Archive $runtimeArchive $runtimeUrl $runtimeSha256 $runtimeRoot $ForceRuntimeDownload.IsPresent
}

if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    $nestedServer = Get-ChildItem -LiteralPath $runtimeRoot -Recurse -Filter "llama-server.exe" -File | Select-Object -First 1
    if ($nestedServer) {
        throw "llama-server.exe was extracted into an unexpected directory: $($nestedServer.FullName)"
    }
    throw "llama-server.exe was not found after extraction"
}

if (-not $SkipCudaRuntime) {
    if ($ForceCudaRuntimeDownload -or -not (Test-Path -LiteralPath $cudaServer -PathType Leaf)) {
        Install-Archive $cudaArchive $cudaUrl $cudaSha256 $cudaRuntimeRoot $ForceCudaRuntimeDownload.IsPresent
        Install-Archive $cudaLibrariesArchive $cudaLibrariesUrl $cudaLibrariesSha256 $cudaRuntimeRoot $ForceCudaRuntimeDownload.IsPresent
    }
    if (-not (Test-Path -LiteralPath $cudaServer -PathType Leaf)) {
        throw "CUDA llama-server.exe was not found after extraction"
    }
}

if (-not $SkipModelDownload) {
    $modelReady = $false
    if ((Test-Path -LiteralPath $model -PathType Leaf) -and -not $ForceModelDownload) {
        Assert-Sha256 $model $modelSha256
        $modelReady = $true
    }
    if (-not $modelReady) {
        $partialModel = "$model.partial"
        if ($ForceModelDownload) {
            & curl.exe --fail --location --retry 3 --output $partialModel $modelUrl
        }
        else {
            & curl.exe --fail --location --retry 3 --continue-at - --output $partialModel $modelUrl
        }
        if ($LASTEXITCODE -ne 0) { throw "Qwen3.5 model download failed" }
        Assert-Sha256 $partialModel $modelSha256
        Move-Item -LiteralPath $partialModel -Destination $model -Force
    }
}

& $server --version
if ($LASTEXITCODE -ne 0) { throw "llama-server smoke test failed" }
Write-Host "llama.cpp $runtimeVersion ready: $server"
if (-not $SkipCudaRuntime) {
    & $cudaServer --version
    if ($LASTEXITCODE -ne 0) { throw "CUDA llama-server smoke test failed" }
    Write-Host "llama.cpp CUDA 12.4 ready: $cudaServer"
}
if ($SkipModelDownload) {
    Write-Host "Model download skipped."
}
else {
    Write-Host "Qwen3.5-4B Q4_K_M ready: $model"
}
