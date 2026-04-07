"use client";

import { useState } from "react";
import type { FullStatus } from "@/lib/types";
import { estimateCost, formatCost } from "@/lib/costCalculator";

const kindBadge: Record<string, string> = {
  direct: "bg-[#ff385c]/10 text-rausch",
  subagent: "bg-purple-50 text-purple-700",
  main: "bg-green-50 text-green-700",
  channel: "bg-amber-50 text-amber-700",
  heartbeat: "bg-surface text-secondary",
};

interface ClientSessionListProps {
  status: FullStatus;
}

export default function ClientSessionList({ status }: ClientSessionListProps) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const sessions = status.sessions.filter((s) => {
    const matchSearch = !search || s.key.toLowerCase().includes(search.toLowerCase()) || s.model.toLowerCase().includes(search.toLowerCase());
    const matchKind = kindFilter === "all" || s.kind === kindFilter;
    return matchSearch && matchKind;
  });

  const kinds = ["all", ...Array.from(new Set(status.sessions.map((s) => s.kind)))];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>세션</h2>
          <p className="text-sm text-secondary mt-1">활성 세션 {status.sessions.length}개</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            {[
              { label: "실행중", value: status.tasks.running, color: "text-rausch" },
              { label: "성공", value: status.tasks.succeeded, color: "text-green-700" },
              { label: "실패", value: status.tasks.failed, color: "text-[#ff385c]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white shadow-card rounded-badge px-3 py-1.5 text-center">
                <p className={`font-bold text-sm ${color}`}>{value}</p>
                <p className="text-secondary text-[10px]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="세션 키 또는 모델 검색..."
          className="flex-1 bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-nearblack placeholder-[#c1c1c1] focus:outline-none focus:border-rausch transition-colors"
        />
        <div className="flex bg-surface rounded-lg p-1 gap-0.5 overflow-x-auto flex-shrink-0">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex-shrink-0 ${kindFilter === k ? "bg-rausch text-white" : "text-secondary hover:text-nearblack"}`}
            >
              {k === "all" ? "전체" : k}
            </button>
          ))}
        </div>
      </div>

      {/* 세션 목록 */}
      {sessions.length === 0 ? (
        <div className="text-center py-16 text-secondary text-sm font-medium">세션 없음</div>
      ) : (
        <>
          {/* 데스크톱 테이블 뷰 */}
          <div className="hidden md:block bg-white shadow-card rounded-card overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_120px_100px_80px] gap-3 px-5 py-3 border-b border-border-light text-xs font-semibold text-secondary">
              <span>세션 키</span>
              <span>종류</span>
              <span>모델</span>
              <span>토큰 사용</span>
              <span className="text-right">비용</span>
            </div>
            <div className="divide-y divide-border-light">
              {sessions.map((s) => {
                const shortKey = s.key.replace(/^agent:\w+:/, "");
                const cost = estimateCost(s.total_tokens, s.model);
                const p = Math.min(100, Math.max(0, s.percent_used));
                const barColor = p >= 80 ? "bg-[#ff385c]" : p >= 50 ? "bg-amber-500" : "bg-green-500";

                return (
                  <div key={s.session_id} className="grid grid-cols-[1fr_80px_120px_100px_80px] gap-3 px-5 py-3 items-center hover:bg-surface transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs text-nearblack font-mono truncate">{shortKey}</p>
                      <p className="text-[10px] text-secondary mt-0.5">{s.agent_id} · {s.age_display}</p>
                    </div>
                    <span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-badge ${kindBadge[s.kind] || "bg-surface text-secondary"}`}>
                        {s.kind}
                      </span>
                    </span>
                    <p className="text-xs text-secondary truncate">{s.model}</p>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-[9px] text-secondary whitespace-nowrap">{p.toFixed(0)}%</span>
                      </div>
                      <p className="text-[9px] text-secondary">{(s.total_tokens / 1000).toFixed(0)}k 토큰</p>
                    </div>
                    <span className="text-xs text-amber-700 text-right font-semibold">{formatCost(cost)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 모바일 카드 뷰 */}
          <div className="md:hidden space-y-2">
            {sessions.map((s) => {
              const shortKey = s.key.replace(/^agent:\w+:/, "");
              const cost = estimateCost(s.total_tokens, s.model);
              const p = Math.min(100, Math.max(0, s.percent_used));
              const barColor = p >= 80 ? "bg-[#ff385c]" : p >= 50 ? "bg-amber-500" : "bg-green-500";

              return (
                <div key={s.session_id} className="bg-white shadow-card rounded-card px-4 py-3">
                  {/* 상단: 세션 키 + kind 배지 */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-nearblack font-mono truncate">{shortKey}</p>
                      <p className="text-[10px] text-secondary mt-0.5">{s.agent_id} · {s.age_display}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-badge flex-shrink-0 ${kindBadge[s.kind] || "bg-surface text-secondary"}`}>
                      {s.kind}
                    </span>
                  </div>
                  {/* 모델명 */}
                  <p className="text-[11px] text-secondary mb-2 truncate">{s.model}</p>
                  {/* 토큰 바 + 비용 */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-[9px] text-secondary whitespace-nowrap">{p.toFixed(0)}%</span>
                      </div>
                      <p className="text-[9px] text-secondary">{(s.total_tokens / 1000).toFixed(0)}k 토큰</p>
                    </div>
                    <span className="text-sm text-amber-700 font-semibold flex-shrink-0">{formatCost(cost)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
