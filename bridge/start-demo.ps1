# start-demo.ps1 - one command to bring the whole Laya-Rogue demo up, cleanly.
#   pwsh -File E:\roguems-laya\bridge\start-demo.ps1
$ErrorActionPreference = "Continue"

# 1. clear stale instances of OUR servers AND stale supervisors
#    (never touches unrelated python/node/pwsh)
Get-CimInstance Win32_Process -Filter "Name like '%python%' or Name like '%node%' or Name like '%pwsh%'" |
  Where-Object { $_.ProcessId -ne $PID -and
    $_.CommandLine -match "\\run-bridge\.ps1|bridge\\server\.py|scripts\\serve\.mjs" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# 2. supervised bridge (auto-restarts on death, logs to runs\bridge.log) - fresh log
if (Test-Path E:\roguems-laya\runs\bridge.log) { Remove-Item E:\roguems-laya\runs\bridge.log -Force }
Start-Process pwsh -ArgumentList "-File","E:\roguems-laya\bridge\run-bridge.ps1" -WindowStyle Hidden

# 3. game static server (single instance)
$game = Get-CimInstance Win32_Process -Filter "Name like '%node%'" |
  Where-Object { $_.CommandLine -match "serve\.mjs" }
if (-not $game) {
  Start-Process node -ArgumentList "E:\roguems-laya\game\scripts\serve.mjs" -WindowStyle Hidden
}

# 4. wait for the bridge model to load, then clear telemetry for a clean run
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  try {
    $h = Invoke-RestMethod http://127.0.0.1:8732/health -TimeoutSec 3
    if ($h.ok) { break }
  } catch {}
}
try { Invoke-RestMethod -Method Post http://127.0.0.1:8732/reset -Body "{}" -TimeoutSec 5 | Out-Null } catch {}

# 5. open the dashboard
Start-Process "http://localhost:8732"
Write-Host "dashboard: http://localhost:8732  (game inside; P toggles; NEW RUN resets telemetry)"
Write-Host "bridge log: E:\roguems-laya\runs\bridge.log"
