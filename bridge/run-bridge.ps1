# run-bridge.ps1 - supervised LayA bridge: exactly one child, logged, self-restarting.
#   pwsh -File E:\roguems-laya\bridge\run-bridge.ps1          (foreground loop)
#   Start-Process pwsh -ArgumentList '-File','E:\roguems-laya\bridge\run-bridge.ps1' -WindowStyle Hidden
$ErrorActionPreference = "Continue"
# singleton: only one supervisor may run (two of them ping-pong the port)
$mtx = New-Object System.Threading.Mutex($false, "LayaBridgeSupervisor")
if (-not $mtx.WaitOne(0)) { Write-Host "supervisor already running; exiting"; exit 0 }
$py = "e:\layaplayground\.venv\Scripts\python.exe"
$srv = "E:\roguems-laya\bridge\server.py"
$log = "E:\roguems-laya\runs\bridge.log"

function Kill-Strays([int]$keepPid) {
  Get-CimInstance Win32_Process -Filter "Name like '%python%'" |
    Where-Object { $_.ProcessId -ne $keepPid -and $_.CommandLine -match "\\bridge\\server\.py" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

while ($true) {
  Kill-Strays 0
  Start-Sleep -Seconds 1
  Add-Content $log ("[{0}] starting bridge" -f (Get-Date -Format "HH:mm:ss"))
  $p = Start-Process $py -ArgumentList $srv -NoNewWindow -PassThru `
        -RedirectStandardAppend $log -RedirectStandardErrorAppend $log
  while (-not $p.HasExited) {
    Start-Sleep -Seconds 10
    Kill-Strays $p.Id   # continuous reaper: no zombie second instance while we live
  }
  Add-Content $log ("[{0}] bridge EXITED - restarting in 2s" -f (Get-Date -Format "HH:mm:ss"))
  Start-Sleep -Seconds 2
}
