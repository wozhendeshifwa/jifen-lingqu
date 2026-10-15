# scripts\checkin-trae.ps1 — Trae CN 每日签到包装脚本
#
# 用途：给「任务计划程序」调用。自动定位 Node 运行时，UTF-8 控制台，透传退出码。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\checkin-trae.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\checkin-trae.ps1 -DryRun
#
# 退出码：0=已领取  2=今日已签  3=需重新登录  1=失败
#
# 为什么要包装：本机没有系统级 Node（`node` 不在 PATH），git 也不在。
# 所以这里按优先级自动找 Node，并允许用 TRAE_CHECKIN_NODE 环境变量覆盖。

[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# curl / Invoke-* 无关，但控制台编码必须切到 UTF-8，否则中文输出乱码（PS 5.1 OEM 代码页）
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $scriptDir 'checkin-trae.cjs'
if (-not (Test-Path $target)) {
    Write-Error "找不到 $target"
    exit 1
}

# ── 定位 Node ───────────────────────────────────────────────────────────────
function Find-Node {
    # 1) 显式覆盖
    if ($env:TRAE_CHECKIN_NODE -and (Test-Path $env:TRAE_CHECKIN_NODE)) {
        return $env:TRAE_CHECKIN_NODE
    }
    # 2) DSH 自带运行时
    $dsh = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path $dsh) { return $dsh }
    # 3) WorkBuddy 自带运行时（版本号目录，取最新的一个）
    $wbRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
    if (Test-Path $wbRoot) {
        $cand = Get-ChildItem $wbRoot -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName 'node.exe' } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
        if ($cand) { return $cand }
    }
    # 4) 系统 PATH
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

$node = Find-Node
if (-not $node) {
    Write-Host '找不到 Node 运行时。请设置环境变量 TRAE_CHECKIN_NODE 指向 node.exe。'
    exit 1
}

$args = @($target)
if ($DryRun) { $args += '--dry-run' }

& $node @args
$code = $LASTEXITCODE

switch ($code) {
    0 { Write-Host '[Trae CN] 已领取今日积分' }
    2 { Write-Host '[Trae CN] 今日已签到（无需操作）' }
    3 { Write-Host '[Trae CN] 登录态失效 —— 请打开一次 Trae CN 客户端，它会自动续期' }
    default { Write-Host "[Trae CN] 签到失败（退出码 $code），详见 scripts\checkin-trae.log" }
}

exit $code
