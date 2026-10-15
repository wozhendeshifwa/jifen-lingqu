# scripts\register-task.ps1 — 注册 Windows 计划任务：每日多次尝试签到
#
# 为什么是「多个时间点」而不是「每天一次」：
#   积分当天不领就永久过期。电脑不一定全天开机，所以一天试多次，
#   只要任一时间点开机就能签上。脚本本身幂等，重复运行没有副作用。
#
# 为什么用「StartWhenAvailable」：
#   实测教训——「重复间隔」在错过后不会被补跑，而独立触发点 + StartWhenAvailable
#   可以在机器重新开机后补跑一次。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -StartTime 10:20 -IntervalHours 5 -Count 4
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -Unregister
#
# 注意：注册「仅登录时运行」的用户级任务不需要管理员权限。

[CmdletBinding()]
param(
    [string]$StartTime = '10:20',
    [int]$IntervalHours = 5,
    [int]$Count = 4,
    [int]$DelayMinutes = 0,
    [string]$TaskName = 'Trae-CN-Daily-Checkin',
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "已删除计划任务 '$TaskName'"
    } else {
        Write-Host "计划任务 '$TaskName' 不存在，无需删除"
    }
    exit 0
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrapper = Join-Path $scriptDir 'checkin-trae.ps1'
if (-not (Test-Path $wrapper)) {
    Write-Error "找不到 $wrapper"
    exit 1
}

# 起始时间（可加抖动，避免整点风暴）
$start = [datetime]::Today.Add([timespan]::Parse($StartTime)).AddMinutes($DelayMinutes)

# 用 PowerShell 5.1 绝对路径，避免 PATH 精简时解析不到
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $wrapper + '"'

$action = New-ScheduledTaskAction -Execute $psExe -Argument $argLine

# 一个起始触发点 + 有限重复；到点没开机时由 StartWhenAvailable 补跑
$trigger = New-ScheduledTaskTrigger -Daily -At $start
if ($Count -gt 1) {
    $repeat = (New-ScheduledTaskTrigger -Once -At $start `
                -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
                -RepetitionDuration (New-TimeSpan -Hours ($IntervalHours * ($Count - 1)))).Repetition
    $trigger.Repetition = $repeat
}

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# 未提权时只能建「仅用户登录时运行」的任务，这也正是我们需要的
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

$end = $start.AddHours($IntervalHours * ($Count - 1))
Write-Host "已注册计划任务 '$TaskName'"
Write-Host "  命令   : $psExe $argLine"
Write-Host "  触发   : $($start.ToString('HH:mm')) 起，每 $IntervalHours 小时一次，共 $Count 次（末次 $($end.ToString('HH:mm'))）"
Write-Host "  补签   : 开启 StartWhenAvailable（错过后开机补跑）"
Write-Host ""
Write-Host "查看：  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "立即跑：Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "删除：  powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -Unregister"
