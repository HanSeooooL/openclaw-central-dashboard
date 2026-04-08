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

import { execSync, exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir, cpus, totalmem, freemem } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { statfsSync } from "node:fs";

const execAsync = promisify(exec);

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
    try {
      execSync(`test -x ${c}`, { stdio: "ignore" });
      return c;
    } catch {}
  }
  // 마지막 수단: 사용자 셸의 PATH로 탐색 (launchd PATH 미포함분 커버)
  try {
    const found = execSync(
      `bash -lc 'command -v openclaw' 2>/dev/null || zsh -lc 'command -v openclaw' 2>/dev/null`,
      { encoding: "utf-8" },
    ).trim();
    if (found) return found;
  } catch {}
  // Homebrew Cellar fallback
  try {
    const found = execSync(
      `ls /opt/homebrew/Cellar/node/*/bin/openclaw /usr/local/Cellar/node/*/bin/openclaw 2>/dev/null | head -1`,
      { encoding: "utf-8" },
    ).trim();
    if (found) return found;
  } catch {}
  return "openclaw";
}

async function runOpenClaw(args) {
  if (openclaw_container) {
    const cmd = `docker exec ${openclaw_container} openclaw ${args}`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    return stdout;
  }
  const bin = findOpenClawBin();
  let stdout = "";
  let stderr = "";
  try {
    const r = await execAsync(`${bin} ${args}`, { timeout: 15000 });
    stdout = r.stdout ?? "";
    stderr = r.stderr ?? "";
  } catch (e) {
    // non-zero 종료여도 stdout에 유효한 데이터가 있으면 활용
    if (e.stdout?.trim()) return e.stdout;
    const detail = e.stderr?.trim() ? `\n  stderr: ${e.stderr.trim()}` : "";
    throw new Error(`openclaw 실행 실패 (bin=${bin}): ${e.message}${detail}`);
  }
  if (!stdout.trim()) {
    throw new Error(`openclaw 빈 출력 (bin=${bin}, args=${args})${stderr.trim() ? `\n  stderr: ${stderr.trim()}` : ""}`);
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

async function collectAndReport() {
  let fullStatus = null;
  let systemInfo = null;

  try {
    const raw = await runOpenClaw("status --json");
    fullStatus = normalizeStatus(JSON.parse(raw));
  } catch (e) {
    console.warn(`[Reporter] openclaw status 실패: ${e}`);
    return;
  }

  try {
    systemInfo = await getSystemInfo();
  } catch (e) {
    console.warn(`[Reporter] 시스템 정보 수집 실패: ${e}`);
  }

  const totalCostUsd = estimateTotalCost(fullStatus.sessions);

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${reporter_token}`,
      },
      body: JSON.stringify({ fullStatus, systemInfo, totalCostUsd }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Reporter] ingest 실패 (${res.status}): ${text}`);
    } else {
      const data = await res.json();
      console.log(`[Reporter] ✅ 스냅샷 전송 완료 (gateway: ${fullStatus.gateway_online ? "online" : "offline"}, sessions: ${fullStatus.session_count})`);
      if (data.alerts > 0) {
        console.log(`[Reporter] 알림 ${data.alerts}개 생성됨`);
      }
    }
  } catch (e) {
    console.warn(`[Reporter] 전송 실패: ${e}`);
  }
}

// ─────────────────────────────────────────
// 명령 폴링 & 실행
// ─────────────────────────────────────────

const VALID_COMMANDS = {
  gateway_start: "gateway start",
  gateway_stop: "gateway stop",
  gateway_restart: "gateway restart",
};

async function pollAndExecuteCommands() {
  let commands = [];
  try {
    const res = await fetch(POLL_URL, {
      headers: { "Authorization": `Bearer ${reporter_token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    commands = data.commands ?? [];
  } catch {
    return;
  }

  for (const cmd of commands) {
    const cliArgs = VALID_COMMANDS[cmd.command];
    if (!cliArgs) {
      await updateCommand(cmd.id, "error", `알 수 없는 명령: ${cmd.command}`);
      continue;
    }

    console.log(`[Reporter] 명령 실행: ${cmd.command} (id=${cmd.id})`);
    await updateCommand(cmd.id, "ack", null);

    try {
      const result = await runOpenClaw(cliArgs);
      await updateCommand(cmd.id, "done", result.trim().slice(0, 500));
      console.log(`[Reporter] 명령 완료: ${cmd.command}`);
    } catch (e) {
      await updateCommand(cmd.id, "error", String(e).slice(0, 500));
      console.warn(`[Reporter] 명령 실패: ${cmd.command} — ${e}`);
    }
  }
}

async function updateCommand(id, status, result) {
  try {
    await fetch(UPDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${reporter_token}`,
      },
      body: JSON.stringify({ id, status, result }),
    });
  } catch (e) {
    console.warn(`[Reporter] 명령 상태 업데이트 실패: ${e}`);
  }
}

// ─────────────────────────────────────────
// WebSocket 이벤트 기반 게이트웨이 연결
// ─────────────────────────────────────────

let lastFullScanAt = 0;
let wsMode = false;        // WebSocket 모드 활성 여부
let wsReconnectTimer = null;
let scanDebounceTimer = null;
let wsLastHealthOk = null; // health 이벤트 상태 추적 (변경 시에만 스캔)

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
    const now = Date.now();
    if (now - lastFullScanAt < WS_SCAN_DEBOUNCE_MS) return; // 너무 빠른 연속 호출 방지
    console.log(`[Reporter] 이벤트 트리거 (${reason}) → 스냅샷 수집`);
    lastFullScanAt = now;
    await collectAndReport();
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
        ws.send(JSON.stringify({
          type: "req",
          id: reqId,
          method: "connect",
          params: {
            client: {
              id: "cli",
              mode: "backend",
              version: "1.0.0",
              platform: process.platform,
            },
            minProtocol: 3,
            maxProtocol: 3,
            role: "operator",
            scopes: [],
            auth: { token: gateway_token },
          },
        }));
        return;
      }

      // ── 인증 응답 ──
      if (msg.type === "res" && msg.ok === true && !wsMode) {
        clearTimeout(authTimeout);
        wsMode = true;
        console.log("[Reporter] ✅ WebSocket 인증 성공 → 이벤트 기반 모드");
        resolveOnce(true);

        // 세션 이벤트 구독
        ws.send(JSON.stringify({
          type: "req",
          id: nextReqId(),
          method: "sessions.subscribe",
          params: {},
        }));

        // 즉시 첫 스캔 (실패해도 핸들러가 silent로 죽지 않도록 try/catch)
        lastFullScanAt = Date.now();
        try {
          await collectAndReport();
        } catch (e) {
          console.warn(`[Reporter] 초기 스냅샷 실패: ${e?.message ?? e} → 30초 후 재시도`);
          setTimeout(() => collectAndReport().catch((err) =>
            console.warn(`[Reporter] 재시도 실패: ${err?.message ?? err}`)
          ), 30000);
        }
        return;
      }

      if (msg.type === "res" && msg.ok === false && !wsMode) {
        clearTimeout(authTimeout);
        const errMsg = msg.error?.message ?? "unknown error";
        console.warn(`[Reporter] WebSocket 인증 실패: ${errMsg} → 폴링 모드`);
        ws.close();
        resolveOnce(false);
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
  if (wsMode) return; // WebSocket 모드면 폴링 불필요

  const healthOk = await checkGatewayHealth();
  const now = Date.now();

  const healthChanged = lastHealthOk !== null && healthOk !== lastHealthOk;
  const heartbeatDue = now - lastFullScanAt >= full_scan_interval_ms;

  if (healthChanged || heartbeatDue) {
    if (healthChanged) {
      console.log(`[Reporter] 게이트웨이 상태 변경: ${lastHealthOk ? "online → offline" : "offline → online"} → 풀 스캔`);
    } else {
      console.log(`[Reporter] heartbeat → 풀 스캔`);
    }
    lastHealthOk = healthOk;
    lastFullScanAt = now;
    await collectAndReport();
  } else {
    lastHealthOk = healthOk;
  }
}

// WS 모드에서도 10분마다 안전망 스캔 (이벤트 누락 방지)
async function wsHeartbeatLoop() {
  if (!wsMode) return;
  const now = Date.now();
  if (now - lastFullScanAt >= WS_HEARTBEAT_INTERVAL_MS) {
    console.log("[Reporter] WS 안전망 heartbeat → 풀 스캔");
    lastFullScanAt = now;
    await collectAndReport();
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
    await collectAndReport().catch((e) => console.warn(`[Reporter] 초기 수집 실패: ${e?.message ?? e}`));
    lastFullScanAt = Date.now();
  } else {
    console.log(`[Reporter] WebSocket 이벤트 기반 모드 활성 (안전망: ${WS_HEARTBEAT_INTERVAL_MS / 1000}s)`);
  }
} else {
  console.log(`[Reporter] 폴링 모드 (헬스체크: ${health_check_interval_ms / 1000}s, 풀스캔: ${full_scan_interval_ms / 1000}s)`);
  await collectAndReport().catch((e) => console.warn(`[Reporter] 초기 수집 실패: ${e?.message ?? e}`));
  lastFullScanAt = Date.now();
}

// 명령 폴링 즉시 시작
pollAndExecuteCommands();

// 공통 타이머
setInterval(healthLoop, health_check_interval_ms);              // 폴링 모드 헬스체크 (WS 모드엔 no-op)
setInterval(wsHeartbeatLoop, WS_HEARTBEAT_INTERVAL_MS);         // WS 모드 안전망
setInterval(pollAndExecuteCommands, command_poll_interval_ms);  // 명령 폴링 (항상)
