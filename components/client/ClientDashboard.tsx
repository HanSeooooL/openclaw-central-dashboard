"use client";

import { useState } from "react";
import StatusHero from "./StatusHero";
import KpiStrip from "./KpiStrip";
import UnifiedTimeline from "./UnifiedTimeline";
import HotSessions from "./HotSessions";
import IncidentFeed from "./IncidentFeed";
import NotificationSettings from "./NotificationSettings";
import TokenSettings from "./TokenSettings";
import type { FullStatus, SystemInfo, Snapshot, FailedTaskInfo } from "@/lib/types";

function formatRelative(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Date(ms).toLocaleDateString("ko-KR");
}

function FailedTasksList({ items }: { items: FailedTaskInfo[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-border-light space-y-2">
      <p className="text-[10px] font-semibold text-secondary uppercase tracking-wide">
        최근 실패 ({items.length})
      </p>
      {items.map((ft, i) => (
        <div
          key={`${ft.task_id ?? i}-${i}`}
          className="border-l-2 border-[#ff385c]/40 pl-2.5"
        >
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-nearblack">
              {ft.label ?? ft.task_id ?? "(이름 없음)"}
            </span>
            <span className="text-[9px] text-secondary tabular-nums">
              {ft.runtime ?? ""}
              {ft.ended_at ? ` · ${formatRelative(ft.ended_at)}` : ""}
            </span>
          </div>
          {ft.error && (
            <p className="text-[10px] text-rausch font-mono mt-0.5 break-all whitespace-pre-wrap">
              {ft.error}
            </p>
          )}
          {ft.terminal_summary && (
            <p className="text-[10px] text-secondary italic mt-0.5">
              {ft.terminal_summary}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 대시보드
// ─────────────────────────────────────────

interface ClientDashboardProps {
  clientId: string;
  status: FullStatus;
  systemInfo: SystemInfo;
  snapshots: Snapshot[];
  loading?: boolean;
}

export default function ClientDashboard({ clientId, status, systemInfo, snapshots, loading }: ClientDashboardProps) {
  void systemInfo;
  const [showFailures, setShowFailures] = useState(false);
  const failedItems = (status.failed_tasks ?? []) as FailedTaskInfo[];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div>
        <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>대시보드</h2>
        <p className="text-sm text-secondary mt-1">OpenClaw 시스템 현황</p>
      </div>

      {/* Layer 1 — Status Hero */}
      <StatusHero status={status} snapshots={snapshots} loading={loading} />

      {/* Layer 2 — KPI Strip */}
      {!loading && <KpiStrip snapshots={snapshots} />}

      {/* Layer 3 — Unified Timeline */}
      {!loading && <UnifiedTimeline snapshots={snapshots} />}

      {/* Layer 4 — Active State */}
      {!loading && (
        <>
          <HotSessions status={status} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* 채널 & 에이전트 */}
            <div className="bg-white shadow-card rounded-card p-5">
              <h3 className="text-sm font-semibold text-nearblack mb-4">채널 & 에이전트</h3>
              <div className="space-y-2">
                {status.channels.length === 0 ? (
                  <p className="text-xs text-secondary">연결된 채널 없음</p>
                ) : (
                  status.channels.map((ch) => {
                    const online = ch.status === "online";
                    return (
                      <div key={ch.name} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? "bg-green-500" : "bg-[#ff385c]"}`} />
                          <div className="min-w-0">
                            <span className="text-sm text-nearblack font-medium">{ch.name}</span>
                            <p className="text-[10px] text-secondary truncate">{ch.bot_name}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-secondary tabular-nums">
                          {online ? (ch.latency_ms != null ? `${ch.latency_ms}ms` : "online") : "offline"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-border-light">
                <h4 className="text-[10px] font-semibold text-secondary uppercase tracking-wide mb-2">에이전트</h4>
                {status.agents.length === 0 ? (
                  <p className="text-xs text-secondary">등록된 에이전트 없음</p>
                ) : (
                  status.agents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-1">
                      <span className="text-sm text-nearblack flex items-center gap-1.5">
                        {a.is_default && <span className="text-amber-500">★</span>}
                        <span className={a.is_default ? "font-medium" : ""}>{a.id}</span>
                      </span>
                      <span className="text-[10px] text-secondary tabular-nums">{a.sessions_count}세션</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 태스크 상태 */}
            <div className="bg-white shadow-card rounded-card p-5">
              <h3 className="text-sm font-semibold text-nearblack mb-4">태스크</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">실행중</p>
                  <p className="text-2xl font-bold text-nearblack mt-0.5 tabular-nums" style={{ letterSpacing: "-0.44px" }}>
                    {status.tasks.running}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">성공</p>
                  <p className="text-2xl font-bold text-green-700 mt-0.5 tabular-nums" style={{ letterSpacing: "-0.44px" }}>
                    {status.tasks.succeeded}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => failedItems.length > 0 && setShowFailures((v) => !v)}
                  disabled={failedItems.length === 0}
                  className={`text-left ${
                    failedItems.length > 0 ? "cursor-pointer hover:opacity-80" : "cursor-default"
                  }`}
                >
                  <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                    실패
                    {failedItems.length > 0 && (
                      <span className="ml-1 text-[9px] text-rausch">
                        {showFailures ? "▼" : "▶"}
                      </span>
                    )}
                  </p>
                  <p
                    className={`text-2xl font-bold mt-0.5 tabular-nums ${
                      status.tasks.failed > 0 ? "text-rausch" : "text-nearblack"
                    }`}
                    style={{ letterSpacing: "-0.44px" }}
                  >
                    {status.tasks.failed}
                  </p>
                </button>
              </div>
              <div className="mt-4 pt-3 border-t border-border-light text-xs text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>전체</span>
                  <span className="tabular-nums text-nearblack">{status.tasks.total}개</span>
                </div>
                <div className="flex justify-between">
                  <span>활성</span>
                  <span className="tabular-nums text-nearblack">{status.tasks.active}개</span>
                </div>
                {status.tasks.timed_out > 0 && (
                  <div className="flex justify-between">
                    <span>타임아웃</span>
                    <span className="tabular-nums text-amber-700">{status.tasks.timed_out}개</span>
                  </div>
                )}
              </div>

              {showFailures && failedItems.length > 0 && (
                <FailedTasksList items={failedItems} />
              )}
            </div>
          </div>

          {/* Layer 5 — Incident Feed */}
          <IncidentFeed clientId={clientId} />

          {/* 설정 */}
          <NotificationSettings clientId={clientId} />
          <TokenSettings clientId={clientId} />
        </>
      )}
    </div>
  );
}
