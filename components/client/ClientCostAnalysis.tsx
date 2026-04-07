"use client";

import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { aggregateCostByModel, totalCost, formatCost } from "@/lib/costCalculator";
import type { FullStatus, Snapshot } from "@/lib/types";

const BAR_COLORS = ["#ff385c", "#8b5cf6", "#10b981", "#c8a000", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];
const PERIODS = [
  { label: "1시간", hours: 1 },
  { label: "6시간", hours: 6 },
  { label: "24시간", hours: 24 },
  { label: "7일", hours: 168 },
  { label: "전체", hours: 0 },
] as const;

function shortModelName(model: string): string {
  return model.replace(/^(anthropic|openai|google|meta)\//i, "").replace(/-\d{8}$/, "").slice(0, 22);
}

function formatTs(ts: string, hours: number): string {
  const d = new Date(ts);
  if (hours <= 6) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (hours <= 48) return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

interface ClientCostAnalysisProps {
  status: FullStatus;
  snapshots: Snapshot[];
  loading?: boolean;
}

export default function ClientCostAnalysis({ status, snapshots, loading }: ClientCostAnalysisProps) {
  const sessions = status.sessions;
  const [periodIdx, setPeriodIdx] = useState(4);
  const { label: periodLabel, hours } = PERIODS[periodIdx];

  const filteredSessions = useMemo(() => {
    if (hours === 0) return sessions;
    const maxAgeMs = hours * 3600 * 1000;
    return sessions.filter((s) => s.age_ms <= maxAgeMs);
  }, [sessions, hours]);

  const filteredSnapshots = useMemo(() => {
    if (hours === 0) return snapshots;
    const since = Date.now() - hours * 3600 * 1000;
    return snapshots.filter((s) => new Date(s.ts).getTime() >= since);
  }, [snapshots, hours]);

  const modelSummary = useMemo(() => aggregateCostByModel(filteredSessions), [filteredSessions]);
  const liveTotalCost = useMemo(() => totalCost(filteredSessions), [filteredSessions]);
  const avgCost = filteredSessions.length > 0 ? liveTotalCost / filteredSessions.length : 0;

  const histTotal = filteredSnapshots.length > 0 ? filteredSnapshots[filteredSnapshots.length - 1]?.total_cost_usd ?? null : null;
  const showHistChart = hours > 0 && filteredSnapshots.length >= 2;

  const barChartData = modelSummary.map((m, i) => ({
    name: shortModelName(m.model),
    cost: parseFloat(m.estimatedCost.toFixed(5)),
    fullName: m.model,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  const histChartData = filteredSnapshots.map((s) => ({
    time: formatTs(s.ts, hours),
    cost: parseFloat((s.total_cost_usd * 100).toFixed(4)),
    tokens: Math.round(s.total_tokens / 1000),
  }));

  const tooltipStyle = { backgroundColor: "#ffffff", border: "1px solid #e8e8e8", borderRadius: 12, fontSize: 11, boxShadow: "rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px" };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>비용 분석</h2>
          <p className="text-sm text-secondary mt-1">
            {hours === 0 ? `최근 로드된 세션 ${sessions.length}개` : `최근 ${periodLabel} 내 세션: ${filteredSessions.length}개 / 로드된 ${sessions.length}개`}
          </p>
        </div>
        <div className="flex bg-surface rounded-lg p-1 gap-0.5 overflow-x-auto flex-shrink-0">
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => setPeriodIdx(i)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all flex-shrink-0 ${i === periodIdx ? "bg-rausch text-white" : "text-secondary hover:text-nearblack"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="col-span-2 sm:col-span-1 bg-white shadow-card rounded-card p-5">
          <p className="text-xs text-secondary mb-1 font-medium">총 추정 비용</p>
          <p className="text-2xl font-bold text-amber-700" style={{ letterSpacing: "-0.44px" }}>{formatCost(liveTotalCost)}</p>
          {histTotal != null && hours > 0 && (
            <p className="text-[10px] text-secondary mt-1">히스토리 기준: {formatCost(histTotal)}</p>
          )}
          <p className="text-xs text-secondary mt-1">{filteredSessions.length}개 세션</p>
        </div>
        <div className="bg-white shadow-card rounded-card p-5">
          <p className="text-xs text-secondary mb-1 font-medium">세션 평균 비용</p>
          <p className="text-2xl font-bold text-rausch" style={{ letterSpacing: "-0.44px" }}>{formatCost(avgCost || null)}</p>
          <p className="text-xs text-secondary mt-1">세션당</p>
        </div>
        <div className="bg-white shadow-card rounded-card p-5">
          <p className="text-xs text-secondary mb-1 font-medium">기본 모델</p>
          <p className="text-lg font-bold text-nearblack truncate" style={{ letterSpacing: "-0.18px" }}>{status.default_model || "—"}</p>
          <p className="text-xs text-secondary mt-1">컨텍스트 {(status.default_context_tokens / 1000).toFixed(0)}k</p>
        </div>
      </div>

      {/* 히스토리 추세 */}
      {showHistChart && (
        <div className="bg-white shadow-card rounded-card p-5">
          <h3 className="text-sm font-semibold text-nearblack mb-4">{periodLabel} 비용 추세</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { key: "cost", label: "추정 비용 (¢)", color: "#c8a000", unit: "¢" },
              { key: "tokens", label: "토큰 사용량 (k)", color: "#ff385c", unit: "k" },
            ].map(({ key, label, color, unit }) => (
              <div key={key}>
                <p className="text-[10px] text-secondary mb-2 font-medium">{label}</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={histChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f2" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6a6a6a" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: "#6a6a6a" }} width={32} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#6a6a6a" }} formatter={(v) => [`${v}${unit}`, label.split(" ")[0]]} />
                    <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 모델별 비용 차트 */}
      <div className="bg-white shadow-card rounded-card p-5">
        <h3 className="text-sm font-semibold text-nearblack mb-4">모델별 추정 비용</h3>
        {barChartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-secondary text-xs space-y-1">
            <span className="text-xl">💸</span>
            <p>{loading ? "로딩 중..." : `${periodLabel} 내 비용을 계산할 수 있는 세션이 없습니다`}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fill: "#6a6a6a", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6a6a6a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#6a6a6a" }} formatter={(value, _name, props) => [formatCost(value as number), (props as { payload?: { fullName?: string } }).payload?.fullName ?? ""]} />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {barChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 모델별 요약 테이블 */}
      {modelSummary.length > 0 && (
        <>
          {/* 데스크톱 테이블 */}
          <div className="hidden md:block bg-white shadow-card rounded-card overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-3 px-5 py-3 border-b border-border-light text-xs font-semibold text-secondary">
              <span>모델</span><span className="text-right">세션</span><span className="text-right">토큰</span><span className="text-right">비용</span>
            </div>
            <div className="divide-y divide-border-light">
              {modelSummary.map((m) => (
                <div key={m.model} className="grid grid-cols-[1fr_80px_80px_80px] gap-3 px-5 py-3 items-center hover:bg-surface transition-colors">
                  <span className="text-sm text-nearblack font-mono truncate">{m.model}</span>
                  <span className="text-xs text-secondary text-right font-medium">{m.sessionCount}</span>
                  <span className="text-xs text-secondary text-right font-medium">{(m.totalTokens / 1000).toFixed(0)}k</span>
                  <span className="text-sm text-amber-700 text-right font-semibold">{formatCost(m.estimatedCost)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* 모바일 카드 */}
          <div className="md:hidden space-y-2">
            {modelSummary.map((m) => (
              <div key={m.model} className="bg-white shadow-card rounded-card px-4 py-3">
                <p className="text-xs text-nearblack font-mono truncate mb-2">{m.model}</p>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <p className="text-[10px] text-secondary mb-0.5">세션</p>
                    <p className="font-semibold text-nearblack">{m.sessionCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-secondary mb-0.5">토큰</p>
                    <p className="font-semibold text-nearblack">{(m.totalTokens / 1000).toFixed(0)}k</p>
                  </div>
                  <div className="ml-auto">
                    <p className="text-[10px] text-secondary mb-0.5 text-right">비용</p>
                    <p className="font-semibold text-amber-700">{formatCost(m.estimatedCost)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
