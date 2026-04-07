"use client";

import Link from "next/link";
import type { Client, Snapshot } from "@/lib/types";
import { formatCost } from "@/lib/costCalculator";

interface ClientCardProps {
  client: Client;
  latestSnapshot: Snapshot | null;
  unreadAlerts?: number;
}

export default function ClientCard({ client, latestSnapshot, unreadAlerts = 0 }: ClientCardProps) {
  const online = latestSnapshot?.gateway_online ?? null;
  const lastSeenMs = latestSnapshot ? new Date(latestSnapshot.ts).getTime() : null;
  const stale = lastSeenMs && Date.now() - lastSeenMs > 120_000;

  const statusDot =
    online === null ? "bg-[#c1c1c1]" :
    stale ? "bg-amber-400" :
    online ? "bg-green-500" : "bg-[#ff385c]";

  const statusLabel =
    online === null ? "미연결" :
    stale ? "지연" :
    online ? "온라인" : "오프라인";

  const statusBadge =
    online === null ? "bg-[#f2f2f2] text-[#6a6a6a]" :
    stale ? "bg-amber-50 text-amber-700 border border-amber-200" :
    online ? "bg-green-50 text-green-700 border border-green-200" :
    "bg-[#ff385c]/8 text-[#ff385c] border border-[#ff385c]/20";

  function formatLastSeen(ts: string | undefined): string {
    if (!ts) return "—";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  }

  return (
    <Link href={`/clients/${client.id}/dashboard`}>
      <div className="bg-white shadow-card rounded-card p-5 hover:shadow-card-hover transition-shadow cursor-pointer group">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot} ${online && !stale ? "animate-pulse" : ""}`}
              />
              <h3 className="text-base font-semibold text-nearblack truncate group-hover:text-rausch transition-colors" style={{ letterSpacing: "-0.18px" }}>
                {client.name}
              </h3>
            </div>
            <p className="text-xs text-secondary mt-1 ml-4">{client.slug}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadAlerts > 0 && (
              <span className="bg-[#ff385c] text-white text-[10px] font-bold px-2 py-0.5 rounded-badge">
                {unreadAlerts}
              </span>
            )}
            <span className={`text-[10px] font-medium px-2.5 py-1 rounded-badge ${statusBadge}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* 메트릭 */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-secondary mb-0.5 font-medium">세션</p>
            <p className="text-sm font-semibold text-nearblack">
              {latestSnapshot?.session_count ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-secondary mb-0.5 font-medium">비용 (누적)</p>
            <p className="text-sm font-semibold text-amber-700">
              {latestSnapshot ? formatCost(latestSnapshot.total_cost_usd) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-secondary mb-0.5 font-medium">레이턴시</p>
            <p className="text-sm font-semibold text-nearblack">
              {latestSnapshot?.gateway_latency_ms != null
                ? `${latestSnapshot.gateway_latency_ms}ms`
                : "—"}
            </p>
          </div>
        </div>

        {/* 태스크 상태 */}
        {latestSnapshot && (latestSnapshot.tasks_running > 0 || latestSnapshot.tasks_failed > 0) && (
          <div className="mt-3 pt-3 border-t border-border-light flex items-center gap-3 text-[10px]">
            {latestSnapshot.tasks_running > 0 && (
              <span className="text-rausch font-medium">실행중 {latestSnapshot.tasks_running}</span>
            )}
            {latestSnapshot.tasks_failed > 0 && (
              <span className="text-[#ff385c] font-medium">실패 {latestSnapshot.tasks_failed}</span>
            )}
          </div>
        )}

        {/* 마지막 보고 */}
        <div className="mt-3 pt-2 border-t border-border-light">
          <p className="text-[10px] text-secondary">
            마지막 보고: {formatLastSeen(latestSnapshot?.ts)}
          </p>
        </div>
      </div>
    </Link>
  );
}
