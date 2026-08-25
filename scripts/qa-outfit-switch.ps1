$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot "src-tauri\target\release\boxgirl.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Release executable not found: $executable"
}

$port = 9229
$previousWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
$app = $null
try {
    $app = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod "http://127.0.0.1:$port/json/list" | Out-Null
            break
        }
        catch {
            Start-Sleep -Milliseconds 200
        }
    }
    if ((Get-Date) -ge $deadline) { throw "WebView2 DevTools endpoint did not start" }

    $env:BOXGIRL_CDP_PORT = [string]$port
    & node (Join-Path $PSScriptRoot "qa-outfit-switch.mjs")
    if ($LASTEXITCODE -ne 0) { throw "Release outfit switch QA failed" }
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

Write-Host "Release outfit switch QA passed."
