"use client";

import { useMemo, useState } from "react";
import type { FullStatus, Snapshot } from "@/lib/types";
import {
  resolvePeriod,
  computeDowntimeMs,
  countRestarts,
} from "@/lib/aggregateUsage";

// ─────────────────────────────────────────
// Layer 1 — Status Hero
// 운영자 triage의 첫 질문 "지금 괜찮은가 / 아니면 왜?"에 답하는 최상단 밴드
// ─────────────────────────────────────────

interface StatusHeroProps {
  status: FullStatus;
  snapshots: Snapshot[];
  loading?: boolean;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return "0초";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 ${m % 60}분`;
  const d = Math.floor(h / 24);
  return `${d}일 ${h % 24}시간`;
}

function formatRelative(ts: string | null): string {
  if (!ts) return "없음";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return "방금 전";
  return `${formatDurationMs(diff)} 전`;
}

/** 오프라인 구간이 "현재도 진행 중"이면 얼마나 이어지고 있는지 */
function currentOfflineDurationMs(snapshots: Snapshot[], online: boolean): number {
  if (online) return 0;
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  // 뒤에서부터 거슬러 올라가며 마지막 online 스냅샷을 찾음
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].gateway_online) {
      return Date.now() - new Date(sorted[i].ts).getTime();
    }
  }
  // 전 구간 오프라인이었으면 첫 스냅샷 이후로 오프라인 상태
  if (sorted.length > 0) {
    return Date.now() - new Date(sorted[0].ts).getTime();
  }
  return 0;
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const colorClass = {
    neutral: "text-nearblack",
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-rausch",
  }[tone];
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-secondary font-medium">{label}</span>
      <span className={`text-sm font-semibold ${colorClass} tabular-nums`}>{value}</span>
    </div>
  );
}

export default function StatusHero({ status, snapshots, loading }: StatusHeroProps) {
  const [showErrors, setShowErrors] = useState(false);

  const derived = useMemo(() => {
    const range24h = resolvePeriod("today"); // "오늘" 기준 — 운영자가 실제로 궁금한 건 "오늘 하루"
    const downtimeMs = computeDowntimeMs(snapshots, {
      start: Date.now() - 24 * 3600 * 1000,
      end: Date.now(),
      label: "24h",
    });
    const restarts = countRestarts(snapshots, {
      start: Date.now() - 24 * 3600 * 1000,
      end: Date.now(),
      label: "24h",
    });
    const latestSnap = snapshots.length
      ? snapshots.reduce((a, b) =>
          new Date(a.ts).getTime() > new Date(b.ts).getTime() ? a : b
        )
      : null;
    const reporterLastSeen = latestSnap?.ts ?? null;
    const reporterStaleMs = reporterLastSeen
      ? Date.now() - new Date(reporterLastSeen).getTime()
      : Infinity;
    // Reporter가 60초 이상 소식 없으면 stale, 3분이면 오프라인 의심
    const reporterState: "live" | "stale" | "offline" =
      reporterStaleMs < 60_000 ? "live" : reporterStaleMs < 180_000 ? "stale" : "offline";

    return {
      downtimeMs,
      restarts,
      reporterLastSeen,
      reporterState,
      currentOfflineMs: currentOfflineDurationMs(snapshots, status.gateway_online),
      _range24h: range24h,
    };
  }, [snapshots, status.gateway_online]);

  const debugErrors = [
    status.debug_gateway_error && { label: "gateway", text: status.debug_gateway_error },
    status.debug_status_error && { label: "status", text: status.debug_status_error },
    status.debug_health_error && { label: "health", text: status.debug_health_error },
  ].filter(Boolean) as { label: string; text: string }[];

  const online = status.gateway_online;
  const isOfflineWithErrors = !online && debugErrors.length > 0;

  return (
    <div
      className={`rounded-card shadow-card overflow-hidden border transition-colors ${
        loading
          ? "bg-white border-border-light"
          : online
            ? "bg-white border-green-200"
            : "bg-[#fff5f6] border-[#ff385c]/30"
      }`}
    >
      {/* 상단 — 큰 상태 배지 + 호스트 */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`relative flex h-3 w-3 ${loading ? "" : online ? "" : ""}`}
          >
            {!loading && online && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                loading ? "bg-[#c1c1c1]" : online ? "bg-green-500" : "bg-[#ff385c]"
              }`}
            />
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <h2
                className="text-xl font-semibold text-nearblack"
                style={{ letterSpacing: "-0.44px" }}
              >
                {loading ? "로딩 중..." : online ? "온라인" : "오프라인"}
              </h2>
              {!loading && online && status.gateway_latency_ms != null && (
                <span className="text-xs text-secondary tabular-nums">
                  {status.gateway_latency_ms}ms
                </span>
              )}
              {!loading && !online && derived.currentOfflineMs > 0 && (
                <span className="text-xs text-rausch font-medium">
                  {formatDurationMs(derived.currentOfflineMs)} 째
                </span>
              )}
            </div>
            <p className="text-xs text-secondary mt-0.5">
              {status.gateway_host || "—"}
              {status.gateway_ip && status.gateway_ip !== status.gateway_host && (
                <span className="text-[#c1c1c1]"> · {status.gateway_ip}</span>
              )}
              {status.gateway_platform && (
                <span className="text-[#c1c1c1]"> · {status.gateway_platform}</span>
              )}
            </p>
          </div>
        </div>

        {/* 우측 — uptime */}
        {!loading && online && status.gateway_uptime && (
          <div className="text-right">
            <p className="text-[10px] text-secondary font-medium">가동시간</p>
            <p className="text-sm font-semibold text-nearblack tabular-nums">
              {status.gateway_uptime}
            </p>
          </div>
        )}
      </div>

      {/* 오프라인 상세 밴드 */}
      {!loading && !online && (
        <div className="px-5 pb-4">
          <div className="rounded-lg bg-[#ff385c]/8 border border-[#ff385c]/20 p-3">
            <div className="flex items-start gap-2">
              <span className="text-rausch text-sm">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-rausch font-semibold">
                  게이트웨이에 접근할 수 없습니다
                </p>
                <p className="text-[11px] text-secondary mt-1">
                  마지막 성공 스냅샷: {formatRelative(derived.reporterLastSeen)}
                  {derived.currentOfflineMs > 0 &&
                    ` · 오프라인 ${formatDurationMs(derived.currentOfflineMs)}`}
                </p>
                {isOfflineWithErrors && (
                  <button
                    onClick={() => setShowErrors((v) => !v)}
                    className="mt-2 text-[11px] text-rausch underline hover:no-underline font-medium"
                  >
                    {showErrors ? "에러 원문 숨기기" : `에러 원문 보기 (${debugErrors.length})`}
                  </button>
                )}
                {showErrors && isOfflineWithErrors && (
                  <div className="mt-2 space-y-2">
                    {debugErrors.map((e) => (
                      <div key={e.label} className="bg-white/60 rounded p-2">
                        <p className="text-[9px] text-secondary font-mono font-semibold uppercase">
                          {e.label}
                        </p>
                        <pre className="text-[10px] text-nearblack font-mono whitespace-pre-wrap break-all mt-1">
                          {e.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 하단 스탯 그리드 */}
      <div className="px-5 py-3 border-t border-border-light bg-surface/40 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="24h 다운타임"
          value={derived.downtimeMs > 0 ? formatDurationMs(derived.downtimeMs) : "0분"}
          tone={derived.downtimeMs > 0 ? "warn" : "good"}
        />
        <Stat
          label="24h 재시작"
          value={`${derived.restarts}회`}
          tone={derived.restarts >= 3 ? "warn" : "neutral"}
        />
        <Stat
          label="Reporter"
          value={
            derived.reporterState === "live"
              ? `정상 · ${formatRelative(derived.reporterLastSeen)}`
              : derived.reporterState === "stale"
                ? `지연 · ${formatRelative(derived.reporterLastSeen)}`
                : `오프라인 · ${formatRelative(derived.reporterLastSeen)}`
          }
          tone={
            derived.reporterState === "live"
              ? "good"
              : derived.reporterState === "stale"
                ? "warn"
                : "bad"
          }
        />
        <Stat
          label="PID"
          value={status.gateway_pid ? String(status.gateway_pid) : "—"}
        />
      </div>
    </div>
  );
}
