"use client";

import type { FullStatus, SessionInfo } from "@/lib/types";
import { estimateCost, formatCost } from "@/lib/costCalculator";

// ─────────────────────────────────────────
// Layer 4 — Hot Sessions
// "지금 뭐가 중요한가"에 답하기 위해 단순 최신순(.slice(0,8)) 대신
// 토큰 Top 5 / 컨텍스트 포화도 Top 5 두 리스트로 표시.
// ─────────────────────────────────────────

interface HotSessionsProps {
  status: FullStatus;
}

function TokenBar({
  tokens,
  max,
  percent,
}: {
  tokens: number;
  max: number;
  percent: number;
}) {
  const p = Math.min(100, Math.max(0, percent));
  const tone = p >= 80 ? "bg-[#ff385c]" : p >= 50 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[9px] text-secondary whitespace-nowrap tabular-nums font-mono">
        {(tokens / 1000).toFixed(0)}k
        {max > 0 && <span className="text-[#c1c1c1]"> / {(max / 1000).toFixed(0)}k</span>}
        <span className="ml-1">{p.toFixed(0)}%</span>
      </span>
    </div>
  );
}

const kindColors: Record<string, string> = {
  direct: "bg-[#ff385c]",
  subagent: "bg-purple-500",
  main: "bg-green-500",
  channel: "bg-amber-500",
  heartbeat: "bg-[#c1c1c1]",
};

function SessionRow({
  session,
  defaultCtxTokens,
}: {
  session: SessionInfo;
  defaultCtxTokens: number;
}) {
  const shortKey = session.key.replace(/^agent:\w+:/, "");
  const ctxMax = session.context_tokens || defaultCtxTokens || 0;
  const cost = estimateCost(session.total_tokens, session.model);
  return (
    <div className="flex gap-2.5 items-start">
      <span
        className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
          kindColors[session.kind] || "bg-[#c1c1c1]"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs text-nearblack truncate font-mono">{shortKey}</p>
          {cost !== null && cost > 0 && (
            <span className="text-[9px] text-amber-700 tabular-nums flex-shrink-0">
              {formatCost(cost)}
            </span>
          )}
        </div>
        <p className="text-[10px] text-secondary mb-1">
          {session.kind} · {session.model} · {session.age_display}
        </p>
        {session.total_tokens > 0 && (
          <TokenBar
            tokens={session.total_tokens}
            max={ctxMax}
            percent={session.percent_used}
          />
        )}
      </div>
    </div>
  );
}

export default function HotSessions({ status }: HotSessionsProps) {
  const sessions = status.sessions ?? [];
  const truncated =
    (status as unknown as { sessions_truncated?: boolean; sessions_original_count?: number })
      .sessions_truncated === true;
  const originalCount =
    (status as unknown as { sessions_original_count?: number }).sessions_original_count ?? 0;

  const byTokens = [...sessions]
    .filter((s) => s.total_tokens > 0)
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, 5);

  const bySaturation = [...sessions]
    .filter((s) => s.percent_used > 0)
    .sort((a, b) => b.percent_used - a.percent_used)
    .slice(0, 5);

  const hasAny = sessions.length > 0;

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-nearblack">활성 세션</h3>
        <span className="text-[10px] text-secondary">
          {sessions.length}개 로드됨
          {truncated && originalCount > 0 && (
            <span className="text-amber-700 font-medium ml-1">
              (전체 {originalCount}개 중 100개)
            </span>
          )}
        </span>
      </div>

      {truncated && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
          <p className="text-[11px] text-amber-900">
            ⚠ 세션이 100개를 초과해 상위 100개만 저장됩니다. 페이로드 보호 목적의 제한이며,
            관측 세션 수는 정확하지만 개별 세션 표시는 일부 누락될 수 있습니다.
          </p>
        </div>
      )}

      {!hasAny ? (
        <p className="text-xs text-secondary py-4">세션이 수집되면 여기에 표시됩니다.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 토큰 Top */}
          <div>
            <h4 className="text-[10px] font-semibold text-secondary uppercase tracking-wide mb-2.5">
              토큰 사용량 Top 5
            </h4>
            <div className="space-y-2.5">
              {byTokens.length === 0 ? (
                <p className="text-[11px] text-secondary">토큰 사용 이력 없음</p>
              ) : (
                byTokens.map((s) => (
                  <SessionRow
                    key={s.session_id}
                    session={s}
                    defaultCtxTokens={status.default_context_tokens}
                  />
                ))
              )}
            </div>
          </div>

          {/* 포화도 Top */}
          <div>
            <h4 className="text-[10px] font-semibold text-secondary uppercase tracking-wide mb-2.5">
              컨텍스트 포화도 Top 5
            </h4>
            <div className="space-y-2.5">
              {bySaturation.length === 0 ? (
                <p className="text-[11px] text-secondary">포화도 데이터 없음</p>
              ) : (
                bySaturation.map((s) => (
                  <SessionRow
                    key={`sat-${s.session_id}`}
                    session={s}
                    defaultCtxTokens={status.default_context_tokens}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
