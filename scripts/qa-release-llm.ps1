$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot "src-tauri\target\release\boxgirl.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Release executable not found: $executable"
}

$port = 9227
$startedAt = Get-Date
$previousWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
$app = $null
$llmProcessIds = @()
try {
    $app = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod "http://127.0.0.1:$port/json/list" | Out-Null
            break
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if ((Get-Date) -ge $deadline) { throw "WebView2 DevTools endpoint did not start" }

    $env:BOXGIRL_CDP_PORT = [string]$port
    & node (Join-Path $PSScriptRoot "qa-release-llm.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Release LLM contract check failed" }

    $llmProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "llama-server.exe" -and $_.CreationDate -ge $startedAt
    })
    if ($llmProcesses.Count -ne 1) {
        throw "Expected one app-owned llama-server; found $($llmProcesses.Count)"
    }
    $llmProcessIds = @($llmProcesses.ProcessId)
    $llmProcess = Get-Process -Id $llmProcessIds[0] -ErrorAction Stop
    $gpuMemory = (& nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader 2>$null) -join ""
    [pscustomobject]@{
        AppPid = $app.Id
        LlmPid = $llmProcess.Id
        LlmWorkingSetMB = [math]::Round($llmProcess.WorkingSet64 / 1MB, 1)
        LlmPrivateMemoryMB = [math]::Round($llmProcess.PrivateMemorySize64 / 1MB, 1)
        LlmThreads = $llmProcess.Threads.Count
        GpuMemory = $gpuMemory
    } | Format-List
}
finally {
    if ($app -and -not $app.HasExited) {
        $closed = $app.CloseMainWindow()
        if ($closed) { $app.WaitForExit(10000) | Out-Null }
        $app.Refresh()
        if (-not $app.HasExited) {
            Stop-Process -Id $app.Id -Force
            $app.WaitForExit()
        }
    }
    if ($null -eq $previousWebViewArguments) {
        Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    }
    else {
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArguments
    }
}

Start-Sleep -Seconds 2
$remainingLlm = @($llmProcessIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
if ($remainingLlm.Count -ne 0) {
    throw "llama-server remained after BoxGirl exited"
}
Write-Host "Release local LLM lifecycle QA passed."
