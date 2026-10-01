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

function Kill-Strays([int[]]$keepPids) {
  Get-CimInstance Win32_Process -Filter "Name like '%python%'" |
    Where-Object { $keepPids -notcontains $_.ProcessId -and $_.CommandLine -match "\\bridge\\server\.py" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

while ($true) {
  Kill-Strays 0
  Start-Sleep -Seconds 1
  Add-Content $log ("[{0}] starting bridge" -f (Get-Date -Format "HH:mm:ss"))
  # NOTE: this pwsh (7.6) has NO -RedirectStandardAppend; use plain redirects.
  $out = "E:\roguems-laya\runs\bridge.out"; $berr = "E:\roguems-laya\runs\bridge.err"
  $p = Start-Process $py -ArgumentList @("-u", $srv) -NoNewWindow -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $berr
  if (-not $p) { Add-Content $log "  Start-Process FAILED"; Start-Sleep -Seconds 5; continue }
  while (-not $p.HasExited) {
    Start-Sleep -Seconds 10
    # keep the trampoline AND its real python child (uv venvs re-exec)
    $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" |
                ForEach-Object { $_.ProcessId })
    Kill-Strays (@($p.Id) + $kids)   # continuous reaper: no zombie second instance
  }
  Add-Content $log ("[{0}] bridge EXITED - restarting in 2s" -f (Get-Date -Format "HH:mm:ss"))
  Start-Sleep -Seconds 2
}
