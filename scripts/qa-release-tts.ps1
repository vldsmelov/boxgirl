$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot "src-tauri\target\release\boxgirl.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Release executable not found: $executable"
}

$port = 9226
$startedAt = Get-Date
$previousWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
$app = $null
$workerTreeIds = @()
try {
    $app = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(20)
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
    & node (Join-Path $PSScriptRoot "qa-release-tts.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Release TTS UI check failed" }

    $workers = Get-CimInstance Win32_Process |
        Where-Object { $_.Name -eq "python.exe" -and $_.CreationDate -ge $startedAt -and $_.CommandLine -like "*silero_worker.py*" }
    if (@($workers).Count -ne 1) { throw "Expected one persistent Silero worker; found $(@($workers).Count)" }
    $allProcesses = @(Get-CimInstance Win32_Process)
    $workerTreeIds = @($workers[0].ProcessId)
    do {
        $children = @($allProcesses | Where-Object {
            $workerTreeIds -contains $_.ParentProcessId -and $workerTreeIds -notcontains $_.ProcessId
        })
        if ($children.Count -gt 0) {
            $workerTreeIds += @($children.ProcessId)
        }
    } while ($children.Count -gt 0)
    $workerProcesses = @($workerTreeIds | ForEach-Object { Get-Process -Id $_ -ErrorAction Stop })
    $workingSet = ($workerProcesses | Measure-Object WorkingSet64 -Sum).Sum
    $privateMemory = ($workerProcesses | Measure-Object PrivateMemorySize64 -Sum).Sum
    [pscustomobject]@{
        AppPid = $app.Id
        WorkerPid = $workers[0].ProcessId
        WorkerProcessTree = ($workerProcesses | ForEach-Object { "$($_.ProcessName):$($_.Id)" }) -join ", "
        WorkerWorkingSetMB = [math]::Round($workingSet / 1MB, 1)
        WorkerPrivateMemoryMB = [math]::Round($privateMemory / 1MB, 1)
        WorkerThreads = ($workerProcesses | ForEach-Object { $_.Threads.Count } | Measure-Object -Sum).Sum
    } | Format-List
}
finally {
    if ($app -and -not $app.HasExited) {
        $closed = $app.CloseMainWindow()
        if ($closed) { $app.WaitForExit(8000) | Out-Null }
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
$remainingWorkers = @($workerTreeIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
if (@($remainingWorkers).Count -ne 0) {
    throw "Silero worker remained after BoxGirl exited"
}
Write-Host "Release TTS lifecycle QA passed."
