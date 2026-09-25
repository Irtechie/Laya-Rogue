# sync-game.ps1 - pull the canonical game from E:\roguerng into the wrap.
# Additive merge: upstream files update our snapshot; our overlay (src/laya.js,
# src/laya/, scripts/macro-run.mjs, tests) is untouched because upstream has
# no such files. The autopilot tag is injected at serve time by scripts/serve.mjs.
# NOTE: robocopy exit code 1 means "files copied" = SUCCESS; >=8 is a real error.
$src = "E:\roguerng"
$dst = "E:\roguems-laya\game"
# serve.mjs is OURS (upstream copy + autopilot tag injection): never overwrite.
robocopy $src $dst /E /XD .git node_modules shots runs /XF serve.mjs /NFL /NDL /NJH | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "SYNC FAILED code=$LASTEXITCODE"; exit 1 }
Write-Host "synced $src -> $dst (robocopy code $LASTEXITCODE)"
git -C E:\roguems-laya add game 2>$null
Write-Host "review with: git -C E:\roguems-laya diff --cached --stat game"
