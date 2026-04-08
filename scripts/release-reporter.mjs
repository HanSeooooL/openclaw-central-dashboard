#!/usr/bin/env node
/**
 * Reporter 릴리즈 스크립트
 *
 * 사용법:
 *   node scripts/release-reporter.mjs [--channel stable|canary] [--notes "메시지"]
 *
 * 동작:
 * 1. reporter/reporter.mjs 의 REPORTER_VERSION 상수 추출
 * 2. 파일 sha256 계산
 * 3. git HEAD commit SHA 확인 (워킹 디렉터리 clean 필수)
 * 4. raw.githubusercontent.com 의 commit-pinned immutable URL 구성
 * 5. supabase reporter_releases 테이블에 INSERT
 *
 * 환경 변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (.env.local 에서 자동 로드)
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const reporterPath = join(repoRoot, "reporter", "reporter.mjs");
const envPath = join(repoRoot, ".env.local");

// ── .env.local 로드 (Next.js 규약) ────────────────────────────────
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
    }
  }
}

// ── CLI 인자 ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const channel = getArg("--channel") ?? "stable";
const notes = getArg("--notes") ?? null;
const force = args.includes("--force");

if (!["stable", "canary"].includes(channel)) {
  console.error(`[release] invalid channel: ${channel} (stable|canary)`);
  process.exit(1);
}

// ── reporter.mjs 읽기 + version 추출 ─────────────────────────────
const content = readFileSync(reporterPath);
const sha256 = createHash("sha256").update(content).digest("hex");

const versionMatch = content.toString("utf-8").match(/REPORTER_VERSION\s*=\s*["']([^"']+)["']/);
if (!versionMatch) {
  console.error("[release] reporter.mjs 에서 REPORTER_VERSION 상수를 찾지 못했습니다.");
  process.exit(1);
}
const version = versionMatch[1];

// ── git 상태 확인 ────────────────────────────────────────────────
const status = execSync("git status --porcelain reporter/reporter.mjs", {
  cwd: repoRoot,
  encoding: "utf-8",
}).trim();
if (status && !force) {
  console.error("[release] reporter.mjs 에 커밋되지 않은 변경이 있습니다. 커밋 후 다시 실행하세요.");
  console.error("         --force 로 우회 가능 (비추천).");
  process.exit(1);
}

// 원격에 푸시되지 않은 커밋도 거부 (raw URL 이 404 나옴)
const unpushed = execSync("git log @{u}..HEAD --oneline 2>/dev/null || true", {
  cwd: repoRoot,
  encoding: "utf-8",
}).trim();
if (unpushed && !force) {
  console.error("[release] 푸시되지 않은 커밋이 있습니다. git push 후 다시 실행하세요.");
  process.exit(1);
}

const commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim();

// ── raw URL (commit-pinned immutable) ────────────────────────────
const repoSlug = "HanSeooooL/openclaw-central-dashboard";
const downloadUrl = `https://raw.githubusercontent.com/${repoSlug}/${commitSha}/reporter/reporter.mjs`;

// ── Supabase INSERT ──────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("[release] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수 필요");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 다운로드 URL 사전 검증
const probe = await fetch(downloadUrl, { method: "GET" });
if (!probe.ok) {
  console.error(`[release] download_url 접근 실패 (${probe.status}): ${downloadUrl}`);
  console.error("         커밋이 원격에 반영되기까지 잠시 기다리거나 커밋 SHA 확인 필요");
  process.exit(1);
}
const fetched = Buffer.from(await probe.arrayBuffer());
const fetchedSha = createHash("sha256").update(fetched).digest("hex");
if (fetchedSha !== sha256) {
  console.error("[release] 원격 파일 sha256 가 로컬과 일치하지 않습니다.");
  console.error(`         local:  ${sha256}`);
  console.error(`         remote: ${fetchedSha}`);
  process.exit(1);
}

const { error } = await supabase.from("reporter_releases").upsert(
  {
    version,
    sha256,
    download_url: downloadUrl,
    channel,
    notes,
    released_at: new Date().toISOString(),
  },
  { onConflict: "version" },
);

if (error) {
  console.error("[release] insert 실패:", error);
  process.exit(1);
}

console.log("✅ reporter release 등록 완료");
console.log(`   version:  ${version}`);
console.log(`   channel:  ${channel}`);
console.log(`   sha256:   ${sha256}`);
console.log(`   commit:   ${commitSha}`);
console.log(`   url:      ${downloadUrl}`);
