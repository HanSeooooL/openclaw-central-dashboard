"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import StatusCard from "@/components/shared/StatusCard";
import ResourceBar from "@/components/shared/ResourceBar";
import ClientHealthOverview from "./ClientHealthOverview";
import { totalCost, formatCost } from "@/lib/costCalculator";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

// ─────────────────────────────────────────
// 추세 차트
// ─────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

function formatTs(ts: string, hours: number): string {
  const d = new Date(ts);
  if (hours <= 6) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (hours <= 48) return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

interface TrendChartsProps {
  clientId: string;
  allSnapshots: Snapshot[];
}

function TrendCharts({ clientId, allSnapshots }: TrendChartsProps) {
  const [periodIdx, setPeriodIdx] = useState(1);
  const { hours, label } = PERIOD_OPTIONS[periodIdx];

  const cutoff = Date.now() - hours * 3600 * 1000;
  const snapshots = allSnapshots.filter((s) => new Date(s.ts).getTime() >= cutoff);

  const chartData = snapshots.map((s) => ({
    time: formatTs(s.ts, hours),
    tokens: Math.round(s.total_tokens / 1000),
    cost: parseFloat((s.total_cost_usd * 100).toFixed(4)),
    latency: s.gateway_latency_ms ?? null,
    sessions: s.session_count,
  }));

  const isEmpty = chartData.length < 2;

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-nearblack">사용량 추세</h3>
        <div className="flex bg-surface rounded-lg p-1 gap-0.5">
          {PERIOD_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setPeriodIdx(i)}
              className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
                i === periodIdx ? "bg-rausch text-white" : "text-secondary hover:text-nearblack"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-40 text-secondary text-xs space-y-2">
          <span className="text-2xl">📊</span>
          <p>{label} 기간 내 데이터가 부족합니다</p>
          <p className="text-[10px] text-[#c1c1c1]">세션 변화 시 스냅샷이 수집됩니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[
            { key: "tokens", label: "토큰 사용량 (k)", color: "#ff385c", unit: "k" },
            { key: "cost", label: "추정 비용 (¢)", color: "#c8a000", unit: "¢" },
            { key: "latency", label: "게이트웨이 레이턴시 (ms)", color: "#10b981", unit: "ms", connectNulls: true },
            { key: "sessions", label: "활성 세션 수", color: "#8b5cf6", unit: "개" },
          ].map(({ key, label, color, unit, connectNulls }) => (
            <div key={key}>
              <p className="text-[10px] text-secondary mb-2 font-medium">{label}</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f2" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6a6a6a" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "#6a6a6a" }} width={32} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e8e8e8", borderRadius: 12, fontSize: 11, boxShadow: "rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px" }}
                    labelStyle={{ color: "#6a6a6a" }}
                    formatter={(v) => [`${v}${unit}`, label.split(" ")[0]]}
                  />
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} connectNulls={connectNulls} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
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
  const totalTokens = status.sessions.reduce((s, sess) => s + sess.total_tokens, 0);
  const estimatedTotal = totalCost(status.sessions);

  const byModel: Record<string, number> = {};
  for (const s of status.sessions) {
    byModel[s.model] = (byModel[s.model] || 0) + s.total_tokens;
  }
  const topModels = Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const kindColors: Record<string, string> = {
    direct: "bg-[#ff385c]", subagent: "bg-purple-500", main: "bg-green-500",
    channel: "bg-amber-500", heartbeat: "bg-[#c1c1c1]",
  };

  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthSnapshots = snapshots.filter((s) => new Date(s.ts).getTime() >= monthStart);
  const daySnapshots = snapshots.filter((s) => now - new Date(s.ts).getTime() <= 24 * 3600 * 1000);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>대시보드</h2>
          <p className="text-sm text-secondary mt-1">OpenClaw 시스템 현황</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-badge text-xs font-medium ${
            loading ? "bg-surface text-secondary" :
            status.gateway_online
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-[#ff385c]/8 text-rausch border border-[#ff385c]/20"
          }`}
        >
          {loading ? (
            <span>로딩 중...</span>
          ) : (
            <>
              <span className={`w-2 h-2 rounded-full ${status.gateway_online ? "bg-green-500 animate-pulse" : "bg-[#ff385c]"}`} />
              {status.gateway_online ? "온라인" : "오프라인"}
              {status.gateway_latency_ms != null && (
                <span className="text-secondary">{status.gateway_latency_ms}ms</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* 건강 개요 */}
      {!loading && (
        <ClientHealthOverview
          status={status}
          systemInfo={systemInfo}
          monthSnapshots={monthSnapshots as import("@/lib/types").Snapshot[]}
          daySnapshots={daySnapshots as import("@/lib/types").Snapshot[]}
        />
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatusCard
          title="게이트웨이"
          value={status.gateway_online ? "정상" : "오프라인"}
          subtitle={status.gateway_uptime}
          icon="🌐"
          color={status.gateway_online ? "green" : "red"}
        />
        <StatusCard
          title="전체 세션"
          value={`${status.session_count}`}
          subtitle={`최근 로드: ${status.sessions.length}개`}
          icon="💬"
          color="blue"
        />
        <StatusCard
          title="태스크"
          value={`${status.tasks.running} 실행중`}
          subtitle={`전체 ${status.tasks.total}개 (실패 ${status.tasks.failed})`}
          icon="⚡"
          color={status.tasks.failed > 0 ? "red" : "purple"}
        />
      </div>

      {/* 토큰 요약 */}
      <div className="bg-white shadow-card rounded-card p-5">
        <h3 className="text-sm font-semibold text-nearblack mb-4">토큰 사용량 요약</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <div>
            <p className="text-xs text-secondary mb-1 font-medium">최근 세션 합산</p>
            <p className="text-2xl font-bold text-nearblack" style={{ letterSpacing: "-0.44px" }}>{(totalTokens / 1000).toFixed(0)}k</p>
            <p className="text-xs text-secondary mt-1">토큰</p>
            {estimatedTotal > 0 && (
              <p className="text-xs text-amber-700 mt-1 font-medium">≈ {formatCost(estimatedTotal)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-secondary mb-1 font-medium">기본 모델</p>
            <p className="text-sm font-semibold text-rausch truncate">{status.default_model}</p>
            <p className="text-xs text-secondary mt-1">컨텍스트 {(status.default_context_tokens / 1000).toFixed(0)}k</p>
          </div>
          <div>
            <p className="text-xs text-secondary mb-2 font-medium">모델별 사용</p>
            {topModels.map(([model, tokens]) => (
              <div key={model} className="flex items-center justify-between text-xs mb-1">
                <span className="text-secondary truncate max-w-[120px]">{model}</span>
                <span className="text-nearblack font-medium">{(tokens / 1000).toFixed(0)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {/* 추세 차트 */}
      <TrendCharts clientId={clientId} allSnapshots={snapshots} />
    </div>
  );
}
