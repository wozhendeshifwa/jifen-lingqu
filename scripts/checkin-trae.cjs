#!/usr/bin/env node
// Trae CN 每日签到 —— 领取免费积分（免费用户 100 积分/天，31 天有效）
//
// 用法：
//   node checkin-trae.mjs              正常签到
//   node checkin-trae.mjs --dry-run    只查状态，不领取
//
// 退出码：0=已领取  2=今日已签  3=需重新登录  1=失败
//
// ── 凭据来源 ────────────────────────────────────────────────────────────────
// Trae CN 把登录态加密存在：
//   %APPDATA%\Trae CN\User\globalStorage\storage.json
// 键 iCubeAuthInfo://icube.cloudide 的值是「自包含信封」：
//   6 字节魔数(74 63 05 10 00 00) + 32 字节内嵌密钥 + AES-128-CBC 密文
// 解密密钥由内嵌密钥经 SHA-512 派生，**不需要任何机器绑定密钥**，所以可离线解。
//
// 注意：~/.trae-cn/trae-jwt-token 里那个明文 JWT 是**无效**的——格式完全合法但
// 服务端一律回 code=1001。真 token 只能从上面那个信封里解出来。这个坑实测踩过。
//
// 设备号取自同一个 storage.json 的键名 iCubeAuthInfo://icube-dc:<digits>，
// 必须是这个真实注册的纯数字设备号；用别处的 UUID 会被服务端拒绝。
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const DRY_RUN = process.argv.includes('--dry-run');

// ── 信封解密 ────────────────────────────────────────────────────────────────
// 常量与算法取自 Trae CN 主进程包（byteCrypto）。
const MAGIC = [116, 99, 5, 16, 0, 0];   // "tc\x05\x10\x00\x00"
const HEAD = 6, KEY32 = 32, SUM64 = 64, AES128 = 16, IVLEN = 16;
const TABLE_A = Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const TABLE_B = Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);

const sha512 = (u8) => new Uint8Array(crypto.createHash('sha512').update(u8).digest());

function decryptEnvelope(b64) {
  const raw = new Uint8Array(Buffer.from(b64, 'base64'));
  for (let i = 0; i < HEAD; i++) {
    if (raw[i] !== MAGIC[i]) throw new Error('信封魔数不匹配（Trae 可能已更换加密方案）');
  }
  const embeddedKey = raw.slice(HEAD, HEAD + KEY32);
  const seed = new Uint8Array(SUM64 + 64);
  seed.set(sha512(embeddedKey), 0);
  seed.set(Uint8Array.from(TABLE_A.map((b, i) => b ^ TABLE_B[i])), SUM64);
  const derived = sha512(seed);
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    derived.slice(0, AES128),
    derived.slice(AES128, AES128 + IVLEN)
  );
  const plain = new Uint8Array(Buffer.concat([
    decipher.update(raw.slice(HEAD + KEY32)),
    decipher.final()
  ]));
  // 前 64 字节是 SHA-512 完整性校验块
  for (let i = 0; i < SUM64; i++) {
    if (sha512(plain.slice(SUM64))[i] !== plain[i]) throw new Error('SHA-512 完整性校验失败');
  }
  return new TextDecoder().decode(plain.slice(SUM64));
}

// ── 读取本机登录态 ──────────────────────────────────────────────────────────
function storagePath() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'TRAE CN', 'User', 'globalStorage', 'storage.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Trae CN 的 storage.json（未登录过 Trae CN 桌面端？）');
}

function loadCredential() {
  const file = storagePath();
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

  const blob = data['iCubeAuthInfo://icube.cloudide'];
  if (!blob) throw new Error('storage.json 中无 iCubeAuthInfo://icube.cloudide（未登录 Trae CN？）');
  const info = JSON.parse(decryptEnvelope(blob));
  if (!info.token || !info.host) throw new Error('解密后的凭据缺少 token/host');

  // 真设备号藏在键名里，必须是纯数字
  const dcKey = Object.keys(data).find((k) => k.toLowerCase().startsWith('icubeauthinfo://icube-dc:'));
  const deviceId = dcKey ? dcKey.split(':').pop() : '';
  if (!/^\d{12,20}$/.test(deviceId)) {
    throw new Error('未能从 storage.json 提取真实设备号（iCubeAuthInfo://icube-dc:*）');
  }
  return { info, deviceId };
}

// ── 日志（JSON Lines，永不写入 token）──────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'checkin-trae.log');
function bjNow() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
function logRun(rec) {
  try {
    const line = JSON.stringify({ script: 'checkin-trae', time: bjNow(), ...rec }) + '\n';
    // 新建文件时写入 UTF-8 BOM：Windows PowerShell 5.1 的 Get-Content 不认无 BOM 的
    // UTF-8，会把中文读成乱码。显式传 Buffer 也避免受系统 locale 影响。
    const isNew = !fs.existsSync(LOG_FILE);
    fs.appendFileSync(LOG_FILE, Buffer.from((isNew ? '\uFEFF' : '') + line, 'utf8'));
  } catch (e) {
    console.error('[warn] 日志写入失败:', e.message);
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  let cred;
  try {
    cred = loadCredential();
  } catch (e) {
    console.log('需重新登录:', e.message);
    logRun({ result: 'LOGIN_REQUIRED', msg: e.message });
    return 3;
  }
  const { info, deviceId } = cred;

  if (info.expiredAt && new Date(info.expiredAt).getTime() < Date.now()) {
    console.log(`Token 已过期（${info.expiredAt}），请打开一次 Trae CN 客户端刷新`);
    logRun({ result: 'LOGIN_REQUIRED', msg: 'token 过期于 ' + info.expiredAt, uid: info.userId });
    return 3;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Cloud-IDE-JWT ' + info.token,
    'x-device-id': deviceId,
  };
  const base = info.host.replace(/\/$/, '');
  const call = async (ep) => {
    const res = await fetch(base + ep, { method: 'POST', headers, body: '{}' });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* 保留原文 */ }
    return { http: res.status, body, text };
  };

  // 本地当日去重：服务端 did_checked_in 语义不稳定，本地日志更可靠
  const today = bjNow().slice(0, 10);
  try {
    const log = fs.readFileSync(LOG_FILE, 'utf-8');
    if (log.split('\n').some((l) => l.includes(`"time":"${today}`) && /"result":"(CLAIMED|ALREADY)"/.test(l))) {
      console.log('今日已签（本地记录）');
      logRun({ result: 'ALREADY', msg: '今日已签（本地记录）', uid: info.userId });
      return 2;
    }
  } catch { /* 首次运行无日志 */ }

  let st;
  try {
    st = await call('/trae/api/v2/ug/checkin_credits/status');
  } catch (e) {
    console.log('网络失败:', e.message);
    logRun({ result: 'ERROR', msg: 'status 网络失败: ' + e.message, uid: info.userId });
    return 1;
  }
  if (st.http === 401 || st.http === 403) {
    console.log(`鉴权失效（HTTP ${st.http}），请打开一次 Trae CN 客户端`);
    logRun({ result: 'LOGIN_REQUIRED', msg: `status HTTP ${st.http}`, uid: info.userId });
    return 3;
  }
  if (st.http !== 200 || !st.body || st.body.code !== 0) {
    console.log('状态查询失败:', st.http, st.text.slice(0, 200));
    logRun({ result: 'ERROR', msg: `status HTTP ${st.http} ${st.text.slice(0, 150)}`, uid: info.userId });
    return 1;
  }

  if (st.body.enable === false) {
    console.log('签到活动当前未开放（enable=false）');
    logRun({ result: 'INACTIVE', msg: '签到活动未开放', uid: info.userId });
    return 2;
  }
  if (st.body.did_checked_in || st.body.checked_in) {
    console.log('今日已签');
    logRun({ result: 'ALREADY', msg: '今日已签', uid: info.userId, credits: st.body.credits });
    return 2;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] 未签到，可领 ${st.body.credits ?? '?'} 积分（本次不领取）`);
    logRun({ result: 'DRY_RUN', uid: info.userId, credits: st.body.credits });
    return 0;
  }

  // 领取。服务端高峰会返回 HTTP 200 + code!=0 + "当前参与用户太多"，属临时繁忙，做有界退避
  const BUSY = /用户太多|稍后再试|too many|busy|rate limit/i;
  let cl = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      cl = await call('/trae/api/v2/ug/checkin_credits/claim');
    } catch (e) {
      console.log('网络失败:', e.message);
      logRun({ result: 'ERROR', msg: 'claim 网络失败: ' + e.message, uid: info.userId });
      return 1;
    }
    if (cl.http === 401 || cl.http === 403) {
      console.log(`鉴权失效（HTTP ${cl.http}）`);
      logRun({ result: 'LOGIN_REQUIRED', msg: `claim HTTP ${cl.http}`, uid: info.userId });
      return 3;
    }
    if (cl.http === 200 && cl.body && cl.body.code === 0) break;
    const msg = cl.body?.message || cl.text;
    if (/已签|already|checked/i.test(msg)) {
      console.log('今日已签（领取接口返回幂等结果）');
      logRun({ result: 'ALREADY', msg, uid: info.userId });
      return 2;
    }
    if (BUSY.test(msg) && attempt < 4) {
      const wait = 15 * attempt;
      console.log(`服务端繁忙（${msg}），${wait}s 后重试（${attempt}/3）`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    break;
  }

  if (!(cl && cl.http === 200 && cl.body && cl.body.code === 0)) {
    console.log('领取失败:', cl?.http, (cl?.body?.message || cl?.text || '').slice(0, 200));
    logRun({ result: 'ERROR', msg: `claim HTTP ${cl?.http}`, uid: info.userId });
    return 1;
  }

  // 不信任响应：回查状态确认真的签上了
  await new Promise((r) => setTimeout(r, 1200));
  let verify = null;
  try { verify = await call('/trae/api/v2/ug/checkin_credits/status'); } catch { /* 忽略 */ }
  const confirmed = !!(verify?.body && (verify.body.did_checked_in || verify.body.checked_in));

  if (confirmed) {
    console.log('签到成功，已回查确认');
    logRun({ result: 'CLAIMED', uid: info.userId, confirmed: true, credits: verify.body.credits });
    return 0;
  }
  console.log('已提交领取，但回查未确认（服务端字段可能延迟）');
  logRun({ result: 'CLAIMED', uid: info.userId, confirmed: false, msg: '回查未确认' });
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('未预期错误:', e.message);
    try { logRun({ result: 'ERROR', msg: String(e.message).slice(0, 200) }); } catch { /* ignore */ }
    process.exit(1);
  });
