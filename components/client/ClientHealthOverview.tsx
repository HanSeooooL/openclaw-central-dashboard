"use client";

import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";
import {
  computeServerStatus,
  computeMonthlyCost,
  computeRecentErrors,
  computeSystemLoad,
  computeContextSaturation,
  type Level,
} from "@/lib/healthScore";

const cardStyle: Record<Level, string> = {
  good: "border-green-200 bg-green-50",
  warning: "border-amber-200 bg-amber-50",
  critical: "border-[#ff385c]/25 bg-[#ff385c]/5",
};

const valueColor: Record<Level, string> = {
  good: "text-green-700",
  warning: "text-amber-700",
  critical: "text-[#ff385c]",
};

const dotColor: Record<Level, string> = {
  good: "bg-green-500",
  warning: "bg-amber-500",
  critical: "bg-[#ff385c]",
};

interface CardProps {
  label: string;
  level: Level;
  main: string;
  sub: string;
  pulse?: boolean;
}

function AbstractCard({ label, level, main, sub, pulse }: CardProps) {
  return (
    <div className={`rounded-card border p-4 flex flex-col gap-2 ${cardStyle[level]}`}>
      <p className="text-xs text-secondary font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor[level]} ${pulse ? "animate-pulse" : ""}`} />
        <span className={`text-lg font-bold leading-tight tracking-tight ${valueColor[level]}`}>{main}</span>
      </div>
      <p className="text-xs text-secondary leading-snug">{sub}</p>
    </div>
  );
}

interface Props {
  status: FullStatus;
  systemInfo: SystemInfo;
  monthSnapshots: Snapshot[];
  daySnapshots: Snapshot[];
}

export default function ClientHealthOverview({ status, systemInfo, monthSnapshots, daySnapshots }: Props) {
  const server = computeServerStatus(status);
  const monthly = computeMonthlyCost(monthSnapshots);
  const errors = computeRecentErrors(daySnapshots);
  const load = computeSystemLoad(systemInfo);
  const ctx = computeContextSaturation(status);

  const costLabel = monthly.hasData
    ? monthly.usd < 0.01 ? "< $0.01" : `$${monthly.usd.toFixed(2)}`
    : "—";
  const costSub = monthly.hasData ? `${monthly.sessionCount}개 세션 기준` : "데이터 없음";
  const errorLabel = errors.count === 0 ? "없음" : `${errors.count}건`;
  const ctxLabel = ctx.total === 0 ? "세션 없음" : ctx.saturated === 0 ? "여유 있음" : `${ctx.saturated}개 포화`;
  const ctxSub = ctx.total === 0 ? "—" : `전체 ${ctx.total}개 세션 중 80% 이상`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      <AbstractCard label="서버 상태" level={server.grade} main={server.title} sub={server.subtitle} pulse={server.grade === "good" && status.gateway_online} />
      <AbstractCard label="이번달 추정비용" level="good" main={costLabel} sub={costSub} />
      <AbstractCard label="최근 오류" level={errors.level} main={errorLabel} sub="최근 24h 기준" />
      <AbstractCard label="시스템 부하" level={load.level} main={`${load.percent}%`} sub={`${load.label} · ${load.detail}`} />
      <AbstractCard label="컨텍스트 포화도" level={ctx.level} main={ctxLabel} sub={ctxSub} />
    </div>
  );
}
