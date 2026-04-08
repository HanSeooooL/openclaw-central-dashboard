#!/usr/bin/env node
/**
 * OpenClaw Central Dashboard — Reporter Agent
 *
 * 고객사 서버에 설치하여 OpenClaw 상태를 중앙 서버로 전송합니다.
 * Node.js 22+ 필요 (openclaw 자체 요구사항과 동일)
 *
 * 실행: node reporter.mjs
 * 설정: ~/.openclaw-reporter/config.json
 */

import { exec, execFile, execSync } from "node:child_process";
import { readFileSync, existsSync, accessSync, constants as fsConstants, statfsSync } from "node:fs";
import { homedir, cpus, totalmem, freemem } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const FETCH_TIMEOUT_MS = 15_000;
const SESSIONS_CAP = 100;

function monotonicNow() { return performance.now(); }

/** 첫 `{` ~ 마지막 `}` 구간만 잘라 JSON.parse. 실패 시 원본으로 재시도. */
function parseJsonLoose(raw) {
  const s = String(raw ?? "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return JSON.parse(s);
}

function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// ─────────────────────────────────────────
// 설정 로드
// ─────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".openclaw-reporter", "config.json");

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`[Reporter] 설정 파일이 없습니다: ${CONFIG_PATH}`);
    console.error(`[Reporter] config.example.json을 참고하여 설정 파일을 생성하세요.`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch (e) {
    console.error(`[Reporter] 설정 파일 파싱 실패: ${e}`);
    process.exit(1);
  }
}

const config = loadConfig();
const {
  supabase_url,
  reporter_token,
  client_id,
  gateway_port = 18789,
  gateway_token: _gateway_token_cfg = null, // reporter config에 명시적으로 설정한 경우
  health_check_interval_ms = 30000,
  full_scan_interval_ms = 300000,
  command_poll_interval_ms = 30000,
  openclaw_bin = null,
  openclaw_container = null,
} = config;

if (!supabase_url || !reporter_token || !client_id) {
  console.error("[Reporter] supabase_url, reporter_token, client_id 필수");
  process.exit(1);
}

// ── OpenClaw 설정에서 gateway token 자동 감지 ──
function autoDetectGatewayToken() {
  // 1) reporter config에 명시된 값 우선
  if (_gateway_token_cfg) return _gateway_token_cfg;

  // 2) 환경변수 (openclaw 자체도 이걸 사용)
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;

  // 3) openclaw config 파일에서 자동 읽기
  //    기본 위치: ~/.openclaw/openclaw.json (또는 레거시 ~/.clawdbot/clawdbot.json)
  //    OPENCLAW_STATE_DIR, OPENCLAW_CONFIG_PATH 환경변수 지원
  const candidates = [];

  const configPathOverride = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (configPathOverride) {
    candidates.push(configPathOverride);
  } else {
    const stateDirOverride = process.env.OPENCLAW_STATE_DIR?.trim();
    const home = homedir();
    if (stateDirOverride) {
      candidates.push(join(stateDirOverride, "openclaw.json"));
      candidates.push(join(stateDirOverride, "clawdbot.json"));
    }
    candidates.push(join(home, ".openclaw", "openclaw.json"));
    candidates.push(join(home, ".clawdbot", "clawdbot.json"));
  }

  for (const p of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(p, "utf-8"));
      const token = cfg?.gateway?.auth?.token?.trim();
      const password = cfg?.gateway?.auth?.password?.trim();
      if (token) return token;
      if (password) return password;
    } catch {}
  }

  return null;
}

const gateway_token = autoDetectGatewayToken();

const INGEST_URL = `${supabase_url}/functions/v1/ingest-snapshot`;
const POLL_URL = `${supabase_url}/functions/v1/poll-commands`;
const UPDATE_URL = `${supabase_url}/functions/v1/update-command`;

// ─────────────────────────────────────────
// 비용 계산 (costCalculator.ts 포팅)
// ─────────────────────────────────────────

const MODEL_PRICING = {
  "claude-opus":      { inputPer1M: 15,   outputPer1M: 75 },
  "claude-sonnet":    { inputPer1M: 3,    outputPer1M: 15 },
  "claude-haiku":     { inputPer1M: 0.8,  outputPer1M: 4 },
  "gpt-5":            { inputPer1M: 10,   outputPer1M: 30 },
  "gpt-4.1-mini":     { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-4.1":          { inputPer1M: 2,    outputPer1M: 8 },
  "gpt-4o":           { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-4o-mini":      { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gemini-2.5-pro":   { inputPer1M: 1.25, outputPer1M: 5 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.35 },
  "gemini-2.0-flash": { inputPer1M: 0.1,  outputPer1M: 0.4 },
  "llama":            { inputPer1M: 0,    outputPer1M: 0 },
};

function findPricing(model) {
  const lower = model.toLowerCase();
  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return MODEL_PRICING[key];
  }
  return null;
}

function estimateTotalCost(sessions) {
  let total = 0;
  for (const s of sessions) {
    if (!s.total_tokens || !s.model) continue;
    const pricing = findPricing(s.model);
    if (!pricing) continue;
    const input = (s.inputTokens ?? s.total_tokens * 0.7);
    const output = (s.outputTokens ?? s.total_tokens * 0.3);
    total += (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000;
  }
  return total;
}

// ─────────────────────────────────────────
// raw JSON → FullStatus 정규화
// ─────────────────────────────────────────

function formatAge(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}초`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}분`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}시간`;
  return `${Math.round(ms / 86400000)}일`;
}

function normalizeStatus(raw) {
  const recentSessions = Array.isArray(raw.sessions?.recent) ? raw.sessions.recent : [];

  return {
    // 런타임
    runtime_version: raw.runtimeVersion ?? "unknown",
    os_label: raw.os?.label ?? null,

    // 게이트웨이
    gateway_online: raw.gateway?.reachable ?? false,
    gateway_latency_ms: raw.gateway?.connectLatencyMs ?? null,
    gateway_url: raw.gateway?.url ?? null,
    gateway_host: raw.gateway?.self?.host ?? null,
    gateway_ip: raw.gateway?.self?.ip ?? null,
    gateway_platform: raw.gateway?.self?.platform ?? null,
    gateway_uptime: raw.gatewayService?.runtimeShort ?? null,
    gateway_service_running: raw.gatewayService?.loaded ?? false,
    gateway_pid: null,

    // 세션
    session_count: raw.sessions?.count ?? 0,
    default_model: raw.sessions?.defaults?.model ?? null,
    default_context_tokens: raw.sessions?.defaults?.contextTokens ?? 0,
    sessions: recentSessions.map((s) => ({
      session_id: s.sessionId,
      key: s.key,
      agent_id: s.agentId,
      kind: s.kind,
      model: s.model,
      total_tokens: s.totalTokens ?? 0,
      percent_used: s.percentUsed ?? 0,
      age_ms: s.age ?? 0,
      age_display: formatAge(s.age ?? 0),
    })),

    // 태스크
    tasks: {
      total: raw.tasks?.total ?? 0,
      running: raw.tasks?.active ?? 0,
      succeeded: raw.tasks?.byStatus?.succeeded ?? 0,
      failed: raw.tasks?.failures ?? 0,
    },

    // 에이전트
    agents: (raw.agents?.agents ?? []).map((a) => ({
      id: a.id,
      is_default: a.id === raw.agents?.defaultId,
      sessions_count: a.sessionsCount ?? 0,
    })),

    // 채널 (channelSummary는 텍스트만 있어 상태 파악 불가 → 빈 배열)
    channels: [],

    // 하트비트
    heartbeat_agents: (raw.heartbeat?.agents ?? []).map((h) => ({
      agent_id: h.agentId,
      enabled: h.enabled,
      interval: h.every ?? null,
    })),

    // 메모리 플러그인
    memory_plugin_enabled: raw.memoryPlugin?.enabled ?? false,
    memory_plugin_slot: raw.memoryPlugin?.slot ?? null,
    memory_files_count: 0,
  };
}

// ─────────────────────────────────────────
// openclaw CLI 실행
// ─────────────────────────────────────────

function isExecutable(p) {
  try { accessSync(p, fsConstants.X_OK); return true; } catch { return false; }
}

function findOpenClawBin() {
  if (openclaw_bin) return openclaw_bin;
  const candidates = [
    join(homedir(), ".openclaw", "bin", "openclaw"),
    join(homedir(), ".local", "bin", "openclaw"),
    join(homedir(), ".cargo", "bin", "openclaw"),
    "/opt/homebrew/bin/openclaw",
    "/usr/local/bin/openclaw",
  ];
  for (const c of candidates) {
    if (isExecutable(c)) return c;
  }
  // PATH로부터 탐색 (login shell 사용 — launchd PATH 미포함 커버)
  try {
    const found = execSync("bash -lc 'command -v openclaw' 2>/dev/null", { encoding: "utf-8" }).trim();
    if (found && isExecutable(found)) return found;
  } catch {}
  try {
    const found = execSync(
      "ls /opt/homebrew/Cellar/node/*/bin/openclaw /usr/local/Cellar/node/*/bin/openclaw 2>/dev/null | head -1",
      { encoding: "utf-8" },
    ).trim();
    if (found && isExecutable(found)) return found;
  } catch {}
  return "openclaw";
}

/** args: string[] — 셸을 통하지 않고 execFile로 직접 실행 (공백/따옴표 안전) */
async function runOpenClaw(args) {
  const argv = Array.isArray(args) ? args : String(args).trim().split(/\s+/);
  let file, fullArgs, label;
  if (openclaw_container) {
    file = "docker";
    fullArgs = ["exec", openclaw_container, "openclaw", ...argv];
    label = `docker exec ${openclaw_container} openclaw ${argv.join(" ")}`;
  } else {
    file = findOpenClawBin();
    fullArgs = argv;
    label = `${file} ${argv.join(" ")}`;
  }

  let stdout = "";
  let stderr = "";
  try {
    const r = await execFileAsync(file, fullArgs, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
    stdout = r.stdout ?? "";
    stderr = r.stderr ?? "";
  } catch (e) {
    // non-zero 종료여도 stdout에 유효한 데이터가 있으면 활용
    if (e.stdout?.toString().trim()) return e.stdout.toString();
    const parts = [];
    if (e.code != null) parts.push(`code=${e.code}`);
    if (e.signal) parts.push(`signal=${e.signal}`);
    if (e.killed) parts.push("killed");
    const meta = parts.length ? ` [${parts.join(", ")}]` : "";
    const stderrText = e.stderr?.toString().trim();
    const stdoutText = e.stdout?.toString().trim();
    const detail = [
      stderrText ? `stderr: ${stderrText}` : null,
      stdoutText ? `stdout: ${stdoutText}` : null,
    ].filter(Boolean).join("\n  ");
    throw new Error(`openclaw 실행 실패 (${label})${meta}: ${e.message}${detail ? `\n  ${detail}` : ""}`);
  }
  if (!stdout.trim()) {
    throw new Error(`openclaw 빈 출력 (${label})${stderr.trim() ? `\n  stderr: ${stderr.trim()}` : ""}`);
  }
  return stdout;
}

// ─────────────────────────────────────────
// 시스템 정보 수집
// ─────────────────────────────────────────

async function getSystemInfo() {
  let cpuUsage = 0;
  try {
    // /proc/stat 사용 (Linux)
    const stat1 = readFileSync("/proc/stat", "utf-8").split("\n")[0].split(/\s+/).slice(1).map(Number);
    await new Promise((r) => setTimeout(r, 100));
    const stat2 = readFileSync("/proc/stat", "utf-8").split("\n")[0].split(/\s+/).slice(1).map(Number);
    const idle1 = stat1[3], total1 = stat1.reduce((a, b) => a + b, 0);
    const idle2 = stat2[3], total2 = stat2.reduce((a, b) => a + b, 0);
    cpuUsage = 100 * (1 - (idle2 - idle1) / (total2 - total1));
  } catch {
    // macOS fallback: loadavg 기반 근사치
    const load = (await execAsync("sysctl -n vm.loadavg 2>/dev/null || uptime").catch(() => ({ stdout: "" }))).stdout;
    const match = load.match(/[\d.]+/);
    cpuUsage = match ? Math.min(100, parseFloat(match[0]) * 25) : 0;
  }

  const memTotal = totalmem();
  const memFree = freemem();
  const memUsed = memTotal - memFree;

  let diskTotal = 0, diskUsed = 0;
  try {
    const stats = statfsSync("/");
    diskTotal = stats.bsize * stats.blocks;
    diskUsed = stats.bsize * (stats.blocks - stats.bfree);
  } catch {
    try {
      const df = (await execAsync("df -k / | tail -1")).stdout.trim().split(/\s+/);
      diskTotal = parseInt(df[1]) * 1024;
      diskUsed = parseInt(df[2]) * 1024;
    } catch {}
  }

  return {
    cpu_usage: Math.round(cpuUsage * 10) / 10,
    memory_total: memTotal,
    memory_used: memUsed,
    memory_percent: Math.round((memUsed / memTotal) * 1000) / 10,
    disk_total: diskTotal,
    disk_used: diskUsed,
    disk_percent: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 1000) / 10 : 0,
  };
}

// ─────────────────────────────────────────
// 스냅샷 수집 & 전송
// ─────────────────────────────────────────

let collecting = false;
let sysInfoFailStreak = 0;

async function collectAndReport() {
  if (collecting) {
    return false;
  }
  collecting = true;
  try {
    let fullStatus;
    try {
      const raw = await runOpenClaw(["status", "--json"]);
      fullStatus = normalizeStatus(parseJsonLoose(raw));
    } catch (e) {
      const snippet = typeof e?.message === "string" ? e.message.slice(0, 300) : String(e).slice(0, 300);
      console.warn(`[Reporter] openclaw status 실패: ${snippet}`);
      return false;
    }

    let systemInfo = null;
    try {
      systemInfo = await getSystemInfo();
      sysInfoFailStreak = 0;
    } catch (e) {
      sysInfoFailStreak++;
      const msg = `[Reporter] 시스템 정보 수집 실패 (${sysInfoFailStreak}회 연속): ${e?.message ?? e}`;
      if (sysInfoFailStreak >= 3) console.error(msg);
      else console.warn(msg);
    }

    const totalCostUsd = estimateTotalCost(fullStatus.sessions);
    const payload = JSON.stringify({ fullStatus, systemInfo, totalCostUsd });

    // 1차 전송 + 5xx/네트워크 실패 시 5초 후 1회 재시도
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetchWithTimeout(INGEST_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${reporter_token}`,
          },
          body: payload,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          lastFullScanSuccessAt = monotonicNow();
          console.log(`[Reporter] ✅ 스냅샷 전송 완료 (gateway: ${fullStatus.gateway_online ? "online" : "offline"}, sessions: ${fullStatus.session_count})`);
          if (data.alerts > 0) console.log(`[Reporter] 알림 ${data.alerts}개 생성됨`);
          return true;
        }
        const text = await res.text().catch(() => "");
        console.warn(`[Reporter] ingest 실패 (${res.status})${attempt === 1 ? " → 5초 후 재시도" : ""}: ${text.slice(0, 300)}`);
        if (res.status < 500 || attempt === 2) return false; // 4xx는 재시도 안 함
      } catch (e) {
        console.warn(`[Reporter] 전송 실패${attempt === 1 ? " → 5초 후 재시도" : ""}: ${e?.message ?? e}`);
        if (attempt === 2) return false;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
  } finally {
    collecting = false;
  }
}

/** 지수 백오프 재시도 스케줄러 (30s → 1m → 3m → 10m cap) */
let backoffTimer = null;
const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 180_000, 600_000];
function scheduleCollectWithBackoff(attempt = 0) {
  if (backoffTimer) clearTimeout(backoffTimer);
  const delay = BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)];
  backoffTimer = setTimeout(async () => {
    backoffTimer = null;
    const ok = await collectAndReport().catch(() => false);
    if (!ok) scheduleCollectWithBackoff(attempt + 1);
  }, delay);
}

// ─────────────────────────────────────────
// 명령 폴링 & 실행
// ─────────────────────────────────────────

const VALID_COMMANDS = {
  gateway_start:   ["gateway", "start"],
  gateway_stop:    ["gateway", "stop"],
  gateway_restart: ["gateway", "restart"],
};

let pollingCommands = false;
const processedCmdIds = new Map(); // insertion-ordered FIFO (key=id, value=timestamp)
const PROCESSED_CAP = 500;

function markProcessed(id) {
  processedCmdIds.set(id, Date.now());
  while (processedCmdIds.size > PROCESSED_CAP) {
    const first = processedCmdIds.keys().next().value;
    if (first == null) break;
    processedCmdIds.delete(first);
  }
}

async function pollAndExecuteCommands() {
  if (pollingCommands) return;
  pollingCommands = true;
  try {
    let commands = [];
    try {
      const res = await fetchWithTimeout(POLL_URL, {
        headers: { "Authorization": `Bearer ${reporter_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      commands = data.commands ?? [];
    } catch {
      return;
    }

    for (const cmd of commands) {
      if (processedCmdIds.has(cmd.id)) continue;
      const cliArgs = VALID_COMMANDS[cmd.command];
      if (!cliArgs) {
        markProcessed(cmd.id);
        await updateCommand(cmd.id, "error", `알 수 없는 명령: ${cmd.command}`);
        continue;
      }

      console.log(`[Reporter] 명령 실행: ${cmd.command} (id=${cmd.id})`);
      markProcessed(cmd.id);
      await updateCommand(cmd.id, "ack", null);

      try {
        const result = await runOpenClaw(cliArgs);
        await updateCommand(cmd.id, "done", result.trim().slice(0, 500));
        console.log(`[Reporter] 명령 완료: ${cmd.command}`);
      } catch (e) {
        await updateCommand(cmd.id, "error", String(e?.message ?? e).slice(0, 500));
        console.warn(`[Reporter] 명령 실패: ${cmd.command} — ${e?.message ?? e}`);
      }
    }
  } finally {
    pollingCommands = false;
  }
}

async function updateCommand(id, status, result) {
  try {
    await fetchWithTimeout(UPDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${reporter_token}`,
      },
      body: JSON.stringify({ id, status, result }),
    });
  } catch (e) {
    console.warn(`[Reporter] 명령 상태 업데이트 실패: ${e?.message ?? e}`);
  }
}

// ─────────────────────────────────────────
// WebSocket 이벤트 기반 게이트웨이 연결
// ─────────────────────────────────────────

let lastFullScanAt = 0;           // 마지막 시도 (monotonic ms)
let lastFullScanSuccessAt = 0;    // 마지막 성공 (monotonic ms)
let wsMode = false;
let wsReconnectTimer = null;
let scanDebounceTimer = null;
let wsLastHealthOk = null;
const wsPendingReqs = new Map();  // id → { method }

const WS_RECONNECT_MS = 15_000;
const WS_SCAN_DEBOUNCE_MS = 30_000;  // 이벤트 폭주 방지: 30초 내 연속 이벤트는 하나로 병합
const WS_HEARTBEAT_INTERVAL_MS = 600_000; // WS 모드에서도 10분마다 안전망 스캔

let reqCounter = 1;
function nextReqId() { return String(reqCounter++); }

/** 이벤트 수신 시 디바운스된 스캔 트리거 */
function triggerScanDebounced(reason) {
  if (scanDebounceTimer) return; // 이미 예약됨
  scanDebounceTimer = setTimeout(async () => {
    scanDebounceTimer = null;
    const now = monotonicNow();
    if (now - lastFullScanAt < WS_SCAN_DEBOUNCE_MS) return;
    console.log(`[Reporter] 이벤트 트리거 (${reason}) → 스냅샷 수집`);
    lastFullScanAt = now;
    await collectAndReport().catch((e) =>
      console.warn(`[Reporter] 이벤트 트리거 수집 실패: ${e?.message ?? e}`)
    );
  }, WS_SCAN_DEBOUNCE_MS);
}

async function connectGatewayWebSocket() {
  if (!gateway_token) return false;

  const WS = globalThis.WebSocket;
  if (!WS) {
    console.log("[Reporter] WebSocket API 없음 (Node.js 22+ 필요) → 폴링 모드");
    return false;
  }

  return new Promise((resolve) => {
    const wsUrl = `ws://localhost:${gateway_port}`;
    let ws;
    let resolved = false;

    function resolveOnce(success) {
      if (!resolved) {
        resolved = true;
        resolve(success);
      }
    }

    // 5초 안에 인증 안 되면 포기
    const authTimeout = setTimeout(() => {
      console.warn("[Reporter] WebSocket 인증 타임아웃 → 폴링 모드");
      ws?.close();
      resolveOnce(false);
    }, 5000);

    try {
      ws = new WS(wsUrl);
    } catch (e) {
      clearTimeout(authTimeout);
      console.warn(`[Reporter] WebSocket 생성 실패: ${e.message}`);
      resolveOnce(false);
      return;
    }

    ws.addEventListener("open", () => {
      // 게이트웨이가 connect.challenge를 보낼 때까지 대기
    });

    ws.addEventListener("message", (event) => {
      handleWsMessage(event).catch((err) => {
        console.warn(`[Reporter] WS 메시지 처리 예외: ${err?.message ?? err}`);
      });
    });

    async function handleWsMessage(event) {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
      } catch {
        return;
      }

      // ── 핸드쉐이크 ──
      if (msg.event === "connect.challenge") {
        const reqId = nextReqId();
        wsPendingReqs.set(reqId, { method: "connect" });
        ws.send(JSON.stringify({
          type: "req",
          id: reqId,
          method: "connect",
          params: {
            client: { id: "cli", mode: "backend", version: "1.0.0", platform: process.platform },
            minProtocol: 3,
            maxProtocol: 3,
            role: "operator",
            scopes: ["operator.read", "sessions.read", "sessions.subscribe"],
            auth: { token: gateway_token },
          },
        }));
        return;
      }

      // ── req/res 매칭 ──
      if (msg.type === "res" && msg.id != null && wsPendingReqs.has(String(msg.id))) {
        const pending = wsPendingReqs.get(String(msg.id));
        wsPendingReqs.delete(String(msg.id));

        if (pending.method === "connect") {
          if (msg.ok === true) {
            clearTimeout(authTimeout);
            wsMode = true;
            console.log("[Reporter] ✅ WebSocket 인증 성공 → 이벤트 기반 모드");
            resolveOnce(true);

            // 세션 이벤트 구독
            const subId = nextReqId();
            wsPendingReqs.set(subId, { method: "sessions.subscribe" });
            ws.send(JSON.stringify({
              type: "req",
              id: subId,
              method: "sessions.subscribe",
              params: {},
            }));

            // 즉시 첫 스캔 + 실패 시 지수 백오프 재시도
            lastFullScanAt = monotonicNow();
            const ok = await collectAndReport().catch((e) => {
              console.warn(`[Reporter] 초기 스냅샷 예외: ${e?.message ?? e}`);
              return false;
            });
            if (!ok) {
              console.warn("[Reporter] 초기 스냅샷 실패 → 백오프 재시도 시작 (30s → 1m → 3m → 10m)");
              scheduleCollectWithBackoff(0);
            }
          } else {
            clearTimeout(authTimeout);
            const errMsg = msg.error?.message ?? "unknown error";
            console.warn(`[Reporter] WebSocket 인증 실패: ${errMsg} → 폴링 모드`);
            ws.close();
            resolveOnce(false);
          }
          return;
        }

        if (pending.method === "sessions.subscribe" && msg.ok === false) {
          console.warn(`[Reporter] sessions.subscribe 실패: ${msg.error?.message ?? "unknown"}`);
        }
        return;
      }

      // ── 런타임 이벤트 (인증 완료 후) ──
      if (!wsMode) return;

      const evtName = msg.event;
      if (!evtName) return;

      if (evtName === "sessions.changed") {
        triggerScanDebounced("sessions.changed");
      } else if (evtName === "health") {
        // health 이벤트: ok 필드가 변할 때만 스캔 (60초마다 브로드캐스트되므로 매번 스캔하지 않음)
        const nowOk = Boolean(msg.payload?.ok);
        if (wsLastHealthOk !== null && nowOk !== wsLastHealthOk) {
          console.log(`[Reporter] health 상태 변화: ${wsLastHealthOk ? "ok → degraded" : "degraded → ok"} → 스냅샷 수집`);
          wsLastHealthOk = nowOk;
          triggerScanDebounced("health.changed");
        } else {
          wsLastHealthOk = nowOk;
        }
      }
      // tick 이벤트는 30초마다 오지만 heartbeat 역할은 별도 타이머로 처리
    }

    ws.addEventListener("close", (event) => {
      const wasMode = wsMode;
      wsMode = false;
      wsPendingReqs.clear();
      clearTimeout(authTimeout);
      resolveOnce(false);

      if (event.code !== 1000 && event.code !== 1001) {
        console.log(`[Reporter] WebSocket 연결 끊어짐 (code: ${event.code}) → ${WS_RECONNECT_MS / 1000}초 후 재연결`);
        wsReconnectTimer = setTimeout(async () => {
          const ok = await connectGatewayWebSocket();
          if (!ok && !wsMode) {
            // 재연결 실패 → 폴링 모드로 복귀 (이미 폴링 루프가 돌고 있음)
            console.log("[Reporter] WebSocket 재연결 실패 → 폴링 모드 유지");
          }
        }, WS_RECONNECT_MS);
      }
    });

    ws.addEventListener("error", () => {
      // close 이벤트가 이어서 호출됨
    });
  });
}

// ─────────────────────────────────────────
// 2단계 헬스 체크 루프 (폴링 모드 전용)
// ─────────────────────────────────────────

const GATEWAY_HEALTH_URL = `http://localhost:${gateway_port}/health`;

let lastHealthOk = null;   // null = 최초 미확인

async function checkGatewayHealth() {
  try {
    const res = await fetch(GATEWAY_HEALTH_URL, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function healthLoop() {
  if (wsMode) return;

  const healthOk = await checkGatewayHealth();
  const now = monotonicNow();
  const healthChanged = lastHealthOk !== null && healthOk !== lastHealthOk;
  // 마지막 "성공" 기준으로 heartbeat 판단 → 실패가 쌓여도 계속 재시도됨
  const heartbeatDue = now - lastFullScanSuccessAt >= full_scan_interval_ms;

  if (healthChanged || heartbeatDue) {
    if (healthChanged) {
      console.log(`[Reporter] 게이트웨이 상태 변경: ${lastHealthOk ? "online → offline" : "offline → online"} → 풀 스캔`);
    } else {
      console.log(`[Reporter] heartbeat → 풀 스캔`);
    }
    lastHealthOk = healthOk;
    lastFullScanAt = now;
    await collectAndReport().catch((e) => console.warn(`[Reporter] heartbeat 수집 실패: ${e?.message ?? e}`));
  } else {
    lastHealthOk = healthOk;
  }
}

// WS 모드에서도 안전망 스캔 (이벤트 누락 방지) — 마지막 성공 기준
async function wsHeartbeatLoop() {
  if (!wsMode) return;
  const now = monotonicNow();
  if (now - lastFullScanSuccessAt >= WS_HEARTBEAT_INTERVAL_MS) {
    console.log("[Reporter] WS 안전망 heartbeat → 풀 스캔");
    lastFullScanAt = now;
    await collectAndReport().catch((e) => console.warn(`[Reporter] WS heartbeat 수집 실패: ${e?.message ?? e}`));
  }
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

console.log(`[Reporter] 시작 — client_id: ${client_id}`);

// WebSocket 모드 시도
if (gateway_token) {
  const tokenSrc = _gateway_token_cfg
    ? "config"
    : process.env.OPENCLAW_GATEWAY_TOKEN
      ? "OPENCLAW_GATEWAY_TOKEN"
      : "openclaw.json 자동 감지";
  console.log(`[Reporter] WebSocket 모드 시도 (토큰 출처: ${tokenSrc})...`);
  const wsOk = await connectGatewayWebSocket();
  if (!wsOk) {
    console.log(`[Reporter] 폴링 모드로 전환 (헬스체크: ${health_check_interval_ms / 1000}s, 풀스캔: ${full_scan_interval_ms / 1000}s)`);
    lastFullScanAt = monotonicNow();
    const ok = await collectAndReport().catch((e) => {
      console.warn(`[Reporter] 초기 수집 예외: ${e?.message ?? e}`);
      return false;
    });
    if (!ok) scheduleCollectWithBackoff(0);
  } else {
    console.log(`[Reporter] WebSocket 이벤트 기반 모드 활성 (안전망: ${WS_HEARTBEAT_INTERVAL_MS / 1000}s)`);
  }
} else {
  console.log(`[Reporter] 폴링 모드 (헬스체크: ${health_check_interval_ms / 1000}s, 풀스캔: ${full_scan_interval_ms / 1000}s)`);
  lastFullScanAt = monotonicNow();
  const ok = await collectAndReport().catch((e) => {
    console.warn(`[Reporter] 초기 수집 예외: ${e?.message ?? e}`);
    return false;
  });
  if (!ok) scheduleCollectWithBackoff(0);
}

// 명령 폴링 즉시 시작
pollAndExecuteCommands();

// 공통 타이머
setInterval(healthLoop, health_check_interval_ms);              // 폴링 모드 헬스체크 (WS 모드엔 no-op)
setInterval(wsHeartbeatLoop, WS_HEARTBEAT_INTERVAL_MS);         // WS 모드 안전망
setInterval(pollAndExecuteCommands, command_poll_interval_ms);  // 명령 폴링 (항상)
