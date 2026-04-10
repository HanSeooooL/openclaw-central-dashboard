"use client";

import { useState, useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import {
  aggregateWithDelta,
  resolvePeriod,
  countIncidents,
  type UsagePeriod,
} from "@/lib/aggregateUsage";
import { formatCost } from "@/lib/costCalculator";

// ─────────────────────────────────────────
// Layer 2 — KPI Strip
// 기간 토글 1개가 4카드 전부를 지배한다. 모든 집계는 aggregateUsage 단일 출처.
// ─────────────────────────────────────────

interface KpiStripProps {
  snapshots: Snapshot[];
}

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "mtd", label: "이번달" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-[#c1c1c1]">—</span>;
  if (Math.abs(pct) < 0.005) return <span className="text-[10px] text-secondary">─ 0%</span>;
  const up = pct > 0;
  return (
    <span
      className={`text-[10px] font-medium tabular-nums ${
        up ? "text-amber-700" : "text-green-700"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct * 100).toFixed(0)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "neutral" | "bad";
}) {
  return (
    <div className="bg-white shadow-card rounded-card p-4 md:p-5">
      <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 tabular-nums ${
          tone === "bad" ? "text-rausch" : "text-nearblack"
        }`}
        style={{ letterSpacing: "-0.44px" }}
      >
        {value}
      </p>
      <div className="mt-1 min-h-[14px]">{sub}</div>
    </div>
  );
}

export default function KpiStrip({ snapshots }: KpiStripProps) {
  const [period, setPeriod] = useState<UsagePeriod>("today");

  const agg = useMemo(() => aggregateWithDelta(snapshots, period), [snapshots, period]);
  const incidents = useMemo(
    () => countIncidents(snapshots, resolvePeriod(period)),
    [snapshots, period]
  );

  return (
    <div className="space-y-3">
      {/* 기간 토글 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-nearblack">사용 요약</h3>
        <div className="flex bg-surface rounded-lg p-1 gap-0.5" role="group" aria-label="기간 선택">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
                period === p.id
                  ? "bg-rausch text-white"
                  : "text-secondary hover:text-nearblack"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="토큰"
          value={formatTokens(agg.tokens)}
          sub={<DeltaBadge pct={agg.tokensDeltaPct} />}
        />
        <KpiCard
          label="추정 비용"
          value={agg.costUsd > 0 ? formatCost(agg.costUsd) : "$0"}
          sub={<DeltaBadge pct={agg.costDeltaPct} />}
        />
        <KpiCard
          label="관측 세션"
          value={`${agg.sessionCount}`}
          sub={
            <span className="text-[10px] text-secondary">
              샘플 {agg.samples}개
            </span>
          }
        />
        <KpiCard
          label="장애 발생"
          value={`${incidents}`}
          tone={incidents > 0 ? "bad" : "neutral"}
          sub={
            <span className="text-[10px] text-secondary">
              {incidents > 0 ? "gateway offline 전환" : "정상"}
            </span>
          }
        />
      </div>
    </div>
  );
}
