param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$env:BOT_CROSSING_HARNESSES = 'codex'
$address = 'http://127.0.0.1:5274'
$runtimeDirectory = Join-Path $appDirectory 'data'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
function Test-Colony {
    try {
        $status = Invoke-RestMethod -Uri "$address/api/harnesses" -TimeoutSec 2
        return [bool]($status.harnesses | Where-Object { $_.id -eq 'codex' })
    } catch { return $false }
}
if (-not (Test-Colony)) {
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    $serverScript = Join-Path $appDirectory 'server\serve.mjs'
    $colonyProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
    Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.pid') -Value $colonyProcess.Id
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-Colony) { break }
        Start-Sleep -Milliseconds 300
    }
    if (-not (Test-Colony)) { throw 'Bot Crossing did not start. See data\server-error.log.' }
}
if (-not $NoBrowser) { Start-Process $address }
