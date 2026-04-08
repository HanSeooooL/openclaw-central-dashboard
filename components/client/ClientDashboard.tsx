"use client";

import ResourceBar from "@/components/shared/ResourceBar";
import StatusHero from "./StatusHero";
import KpiStrip from "./KpiStrip";
import UnifiedTimeline from "./UnifiedTimeline";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

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

function TokenBar({ percent, tokens }: { percent: number; tokens: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const color = p >= 80 ? "bg-[#ff385c]" : p >= 50 ? "bg-amber-500" : "bg-rausch";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[9px] text-secondary whitespace-nowrap">
        {(tokens / 1000).toFixed(0)}k/{p.toFixed(0)}%
      </span>
    </div>
  );
}

export default function ClientDashboard({ clientId, status, systemInfo, snapshots, loading }: ClientDashboardProps) {
  const kindColors: Record<string, string> = {
    direct: "bg-[#ff385c]", subagent: "bg-purple-500", main: "bg-green-500",
    channel: "bg-amber-500", heartbeat: "bg-[#c1c1c1]",
  };

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* 시스템 리소스 */}
        <div className="bg-white shadow-card rounded-card p-5">
          <h3 className="text-sm font-semibold text-nearblack mb-4">시스템 리소스</h3>
          <div className="space-y-4">
            <ResourceBar label="CPU" value={systemInfo.cpu_usage} icon="⚡" />
            <ResourceBar label="메모리" value={systemInfo.memory_percent} icon="🧠" />
            <ResourceBar label="디스크" value={systemInfo.disk_percent} icon="💾" />
          </div>
          <div className="mt-4 pt-3 border-t border-border-light text-xs text-secondary space-y-1">
            <p>메모리: {(systemInfo.memory_used / 1073741824).toFixed(1)}GB / {(systemInfo.memory_total / 1073741824).toFixed(1)}GB</p>
            <p>디스크: {(systemInfo.disk_used / 1073741824).toFixed(0)}GB / {(systemInfo.disk_total / 1073741824).toFixed(0)}GB</p>
            <p>호스트: {status.gateway_host || "..."}</p>
          </div>
        </div>

        {/* 채널 & 에이전트 */}
        <div className="bg-white shadow-card rounded-card p-5">
          <h3 className="text-sm font-semibold text-nearblack mb-4">채널 상태</h3>
          <div className="space-y-3">
            {status.channels.length === 0 ? (
              <p className="text-xs text-secondary">채널 없음</p>
            ) : (
              status.channels.map((ch) => (
                <div key={ch.name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{ch.name === "Discord" ? "💜" : "✈️"}</span>
                    <div>
                      <span className="text-sm text-nearblack font-medium">{ch.name}</span>
                      <p className="text-[10px] text-secondary">{ch.bot_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ch.latency_ms != null && <span className="text-[10px] text-secondary">{ch.latency_ms}ms</span>}
                    <span className={`w-2 h-2 rounded-full ${ch.status === "online" ? "bg-green-500" : "bg-[#ff385c]"}`} />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border-light">
            <h4 className="text-xs font-semibold text-nearblack mb-2">에이전트</h4>
            {status.agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1">
                <span className="text-sm text-nearblack">{a.is_default ? "⭐" : "🤖"} {a.id}</span>
                <span className="text-[10px] text-secondary">{a.sessions_count}세션</span>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 세션 */}
        <div className="bg-white shadow-card rounded-card p-5">
          <h3 className="text-sm font-semibold text-nearblack mb-4">최근 세션</h3>
          <div className="space-y-2.5">
            {status.sessions.slice(0, 8).map((s) => {
              const shortKey = s.key.replace(/^agent:\w+:/, "");
              return (
                <div key={s.session_id} className="flex gap-3 items-start">
                  <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${kindColors[s.kind] || "bg-[#c1c1c1]"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-nearblack truncate font-mono">{shortKey}</p>
                    <p className="text-[10px] text-secondary mb-0.5">{s.kind} · {s.age_display}</p>
                    {s.total_tokens > 0 && <TokenBar percent={s.percent_used} tokens={s.total_tokens} />}
                  </div>
                </div>
              );
            })}
            {status.sessions.length === 0 && <p className="text-xs text-secondary">세션 없음</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
