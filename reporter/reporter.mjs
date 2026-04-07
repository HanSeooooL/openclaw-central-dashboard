#!/usr/bin/env node
/**
 * OpenClaw Central Dashboard — Reporter Agent
 *
 * 고객사 서버에 설치하여 OpenClaw 상태를 중앙 서버로 전송합니다.
 * Node.js 18+ 필요 (fetch 내장)
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
  report_interval_ms = 30000,
  command_poll_interval_ms = 10000,
  openclaw_bin = null,
  openclaw_container = null,
} = config;

if (!supabase_url || !reporter_token || !client_id) {
  console.error("[Reporter] supabase_url, reporter_token, client_id 필수");
  process.exit(1);
}

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
    const input = s.total_tokens * 0.7;
    const output = s.total_tokens * 0.3;
    total += (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000;
  }
  return total;
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
    "openclaw",
  ];
  for (const c of candidates) {
    try {
      execSync(`which ${c} 2>/dev/null || test -f ${c}`, { stdio: "ignore" });
      return c;
    } catch {}
  }
  return "openclaw";
}

async function runOpenClaw(args) {
  if (openclaw_container) {
    const cmd = `docker exec ${openclaw_container} openclaw ${args}`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    return stdout;
  }
  const bin = findOpenClawBin();
  const { stdout } = await execAsync(`${bin} ${args}`, { timeout: 15000 });
  return stdout;
}

// ─────────────────────────────────────────
// 시스템 정보 수집
// ─────────────────────────────────────────

async function getSystemInfo() {
  const cpuList = cpus();
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
    fullStatus = JSON.parse(raw);
  } catch (e) {
    console.warn(`[Reporter] openclaw status 실패: ${e}`);
    return;
  }

  try {
    systemInfo = await getSystemInfo();
  } catch (e) {
    console.warn(`[Reporter] 시스템 정보 수집 실패: ${e}`);
  }

  const totalCostUsd = estimateTotalCost(fullStatus?.sessions ?? []);

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
// 메인 루프
// ─────────────────────────────────────────

console.log(`[Reporter] 시작 — client_id: ${client_id}`);
console.log(`[Reporter] 스냅샷 주기: ${report_interval_ms / 1000}s, 명령 폴링: ${command_poll_interval_ms / 1000}s`);

// 즉시 첫 실행
collectAndReport();
pollAndExecuteCommands();

setInterval(collectAndReport, report_interval_ms);
setInterval(pollAndExecuteCommands, command_poll_interval_ms);
