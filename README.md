# 积分领取

每日自动领取本机 AI 工具的免费额度积分，目标平台：

| 平台 | 积分 | 实现方式 | 状态 |
|---|---|---|---|
| **Trae CN**（字节） | 100/天，31 天有效 | 本仓库脚本，纯 HTTP | ✅ 已实测跑通 |
| **WorkBuddy**（腾讯） | 100/天，当月有效 | WorkBuddy 自带自动化 | ⚠️ 见下 |

每天不领就永久过期的额度，是这个项目唯一的存在理由。

## Trae CN

### 跑一次

```powershell
powershell -ExecutionPolicy Bypass -File scripts\checkin-trae.ps1
powershell -ExecutionPolicy Bypass -File scripts\checkin-trae.ps1 -DryRun   # 只查状态，不领取
```

退出码：`0`=已领取 `2`=今日已签 `3`=需重新登录 `1`=失败。日志写在 `scripts\checkin-trae.log`（JSON Lines，**不含任何 token**）。

### 装成定时任务

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
```

默认每天 **10:20 起、每 5 小时一次、共 4 次**（10:20 / 15:20 / 20:20 / 01:20），并开启 `StartWhenAvailable`（错过的时间点会在开机后补跑）。一天试多次是因为电脑不一定全天开机，而脚本幂等，重复跑没有副作用。

```powershell
# 自定义时间窗口
... -File scripts\register-task.ps1 -StartTime 09:00 -IntervalHours 4 -Count 5
# 删除
... -File scripts\register-task.ps1 -Unregister
```

不需要管理员权限（注册的是「仅登录时运行」的用户级任务）。

### 唯一会失效的情形

Trae 的登录凭证（JWT）**约 13 天过期，且只有 Trae CN 桌面客户端运行时才会刷新**。所以：

> **大约每两周打开一次 Trae CN 客户端**，否则签到会以退出码 `3` 失败。

脚本每次运行都实时解密最新凭证，不需要你手动复制任何东西。

## WorkBuddy

**没有写脚本，这是刻意的决定。** 原因是它和 Trae 的形态根本不同：

- WorkBuddy 的 `accessToken` 是 **AES-256-GCM 信封加密**，解封密钥**只存在于运行中的 App 进程内存**，磁盘上任何地方都没有。旧版那个「纯 Node 就能解的 `state.vscdb` 旧库」在这台机器上**从未存在过**。
- 它的签到能力 `auth:claimDailyCheckin` 只通过 **Windows 命名管道 IPC**（`~/.workbuddy/wbipc/endpoint.json`，带 ticket 鉴权）暴露，没有对外 HTTP 接口。

也就是说：**任何外部脚本都拿不到它的凭证，除非逆向一个私有 IPC 协议。** 那既脆弱又不划算。

**正确的做法是用 WorkBuddy 自己的自动化能力。** 在 WorkBuddy 里对它说：

> 请用 automation_update 创建一个 recurring 自动化任务，每天 10:20 触发，提示词是「领取今日 Buddy 加油站积分，并汇报领到了多少」。

理由：
- WorkBuddy **本来就必须在运行**才能签到，而它自带定时器，不用你额外保活。
- 它点的是自己的按钮，用的是自己的凭证——**零凭据外泄、零逆向、不可能因版本升级而失效**。
- 签到积分当月有效，漏一天就少 100 分，但连续签到奖励（7/14/28 天档位，需手动兑换）才是更需要「别断签」的部分。

## 设计约束（给未来的自己）

1. **`~/.trae-cn/trae-jwt-token` 是无效文件。** 它格式完全合法（RS256、`iss:"trae"`、带 `exp`），但服务端一律回 `code=1001`。真 token 只能从 `storage.json` 的 `iCubeAuthInfo://icube.cloudide` 解密信封里取。这个坑实测踩过。
2. **不信任服务端的状态字段。** Trae 的 `did_checked_in` 语义不稳定，所以脚本①自己记本地当日记录，②领取后**回查确认**。
3. **`.ps1` 文件必须带 UTF-8 BOM。** 本机只有 Windows PowerShell 5.1（没有 `pwsh`），它按 ANSI/GBK 解码 `.ps1`，无 BOM 的中文会变成乱码并直接把语法搞崩。Node 侧（`.cjs`）不受影响。
4. **回环请求要绕开代理**，且不要用 `-ComputerName` 做端口探测（实测极慢）。
5. **本机没有系统级 Node，git 也不在 PATH。** 所以包装脚本按 DSH 运行时 → WorkBuddy 运行时 → PATH 的顺序自动找 Node，可用 `TRAE_CHECKIN_NODE` 覆盖。

## 维护陷阱：git 的 DNS 钉住

本仓库的 `.git/config` 里有一条：

```
[http]
	curloptResolve = github.com:443:140.82.116.3
```

**这是必需的，不是手滑。** 这台机器上 `github.com` 的 DNS 解析（`20.205.243.166`）实测**连不通**，不加钉住时 `git push` 会报 `unable to connect to server` / `Recv failure: Connection was reset`。

**但它会失效**——这个 IP 哪天不通了，push 就会突然失败。届时这样换一个：

```powershell
# 1) 找当前能用的 IP（挑 http=200 且 exit=0 的那个）
foreach ($ip in @('140.82.116.3','140.82.113.3','20.205.243.166')) {
  curl.exe -s -o NUL -w "$ip -> %{http_code}`n" --max-time 6 --resolve "github.com:443:$ip" https://github.com/
}
# 2) 换上
git config http.curloptResolve github.com:443:<能用的IP>
```

## 风险与边界

- Trae 签到接口是**社区逆向**得到的，不是官方 API，随时可能变更。脚本以「响亮失败」为原则：区分退出码，不静默吞错。
- TRAE 官方风控明确把**云电脑 / 远程桌面 / 模拟器 / 虚拟机**列为拦截触发项，会导致账号被自动登出。所以**不要把本脚本放到云服务器或 CI 上跑**，它只适合跑在你自己这台已登录的机器上。
- 腾讯 CodeBuddy / WorkBuddy 的用户协议禁止「通过非腾讯云授权的第三方软件、插件、外挂、系统登录或使用本软件」，罚则包括封号。这也是本仓库不写 WorkBuddy 脚本的第二个理由。
- 仅用于自己的账号。多账号（尤其在同一台机器上）会触发风控。
