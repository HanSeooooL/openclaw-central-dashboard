import type { Snapshot } from "./types";

// ─────────────────────────────────────────
// 스냅샷 기반 사용량/비용 집계 유틸
// dashboard / costs / health overview 에서 불일치하던 계산 로직을 단일화한다.
// ─────────────────────────────────────────

export type UsagePeriod = "today" | "7d" | "30d" | "mtd";

export interface PeriodRange {
  start: number; // epoch ms
  end: number;
  label: string;
}

/** 기간 ID → 실제 시작/끝 epoch ms */
export function resolvePeriod(period: UsagePeriod, now: number = Date.now()): PeriodRange {
  const d = new Date(now);
  switch (period) {
    case "today": {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return { start, end: now, label: "오늘" };
    }
    case "7d":
      return { start: now - 7 * 86_400_000, end: now, label: "최근 7일" };
    case "30d":
      return { start: now - 30 * 86_400_000, end: now, label: "최근 30일" };
    case "mtd": {
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return { start, end: now, label: "이번달" };
    }
  }
}

/** 직전 동일 길이 기간 (전주/전월 대비용) */
export function previousPeriod(range: PeriodRange): PeriodRange {
  const len = range.end - range.start;
  return { start: range.start - len, end: range.start, label: `이전 ${range.label}` };
}

export interface UsageAggregate {
  /** 기간 내 토큰 증가량 (스냅샷 delta 합산) */
  tokens: number;
  /** 기간 내 비용 증가량 USD */
  costUsd: number;
  /** 기간 내 관측된 고유 세션 수 */
  sessionCount: number;
  /** 기간 내 샘플(스냅샷) 수 */
  samples: number;
}

/**
 * 스냅샷 시계열에서 기간 내 사용량을 delta 합산으로 집계.
 *
 * total_tokens / total_cost_usd 는 "관측 시점의 누적값"이라고 가정.
 * 연속 스냅샷 간 차이를 모두 더하면 기간 내 실제 증가량이 된다.
 * 카운터가 감소하면(게이트웨이 재시작 등) 그 구간은 0으로 처리.
 */
export function aggregateUsage(snapshots: Snapshot[], range: PeriodRange): UsageAggregate {
  // ts 오름차순 정렬 보장
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  let tokens = 0;
  let costUsd = 0;
  let samples = 0;
  let prev: Snapshot | null = null;
  const sessionIds = new Set<string>();

  for (const s of sorted) {
    const t = new Date(s.ts).getTime();
    if (t < range.start || t > range.end) {
      prev = s;
      continue;
    }
    samples += 1;

    if (prev) {
      const dTok = s.total_tokens - prev.total_tokens;
      const dCost = Number(s.total_cost_usd) - Number(prev.total_cost_usd);
      if (dTok > 0) tokens += dTok;
      if (dCost > 0) costUsd += dCost;
    }

    // 기간 내 관측된 세션 key 수집 (full_status.sessions)
    const sess = s.full_status?.sessions;
    if (Array.isArray(sess)) {
      for (const x of sess) sessionIds.add(x.session_id || x.key);
    }

    prev = s;
  }

  return { tokens, costUsd, sessionCount: sessionIds.size, samples };
}

export interface UsageWithDelta extends UsageAggregate {
  /** 전기 대비 토큰 변화율 (-1 ~ +∞), null이면 비교 불가 */
  tokensDeltaPct: number | null;
  costDeltaPct: number | null;
}

/** 기간 집계 + 직전 동일 기간 대비 델타 */
export function aggregateWithDelta(
  snapshots: Snapshot[],
  period: UsagePeriod,
  now: number = Date.now()
): UsageWithDelta {
  const curRange = resolvePeriod(period, now);
  const prevRange = previousPeriod(curRange);
  const cur = aggregateUsage(snapshots, curRange);
  const prev = aggregateUsage(snapshots, prevRange);

  const pct = (c: number, p: number) => (p > 0 ? (c - p) / p : null);

  return {
    ...cur,
    tokensDeltaPct: pct(cur.tokens, prev.tokens),
    costDeltaPct: pct(cur.costUsd, prev.costUsd),
  };
}

/** 기간 내 장애(게이트웨이 오프라인 전환) 횟수 */
export function countIncidents(snapshots: Snapshot[], range: PeriodRange): number {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  let count = 0;
  let prev: Snapshot | null = null;
  for (const s of sorted) {
    const t = new Date(s.ts).getTime();
    if (t < range.start || t > range.end) {
      prev = s;
      continue;
    }
    if (prev && prev.gateway_online && !s.gateway_online) count += 1;
    prev = s;
  }
  return count;
}

/** 기간 내 게이트웨이 다운타임(ms) — 오프라인 구간 길이 합산 */
export function computeDowntimeMs(snapshots: Snapshot[], range: PeriodRange): number {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  let down = 0;
  let prev: Snapshot | null = null;
  for (const s of sorted) {
    const t = Math.max(range.start, Math.min(range.end, new Date(s.ts).getTime()));
    if (prev && !prev.gateway_online) {
      const pt = Math.max(range.start, new Date(prev.ts).getTime());
      if (t > pt) down += t - pt;
    }
    prev = s;
  }
  // 마지막 구간이 여전히 오프라인이면 end 까지 연장
  if (prev && !prev.gateway_online) {
    const pt = Math.max(range.start, new Date(prev.ts).getTime());
    if (range.end > pt) down += range.end - pt;
  }
  return down;
}

/** 재시작 횟수 — gateway_uptime 문자열 변화로는 정확도 낮으므로
 *  "오프라인 → 온라인" 전환 횟수로 근사. */
export function countRestarts(snapshots: Snapshot[], range: PeriodRange): number {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  let count = 0;
  let prev: Snapshot | null = null;
  for (const s of sorted) {
    const t = new Date(s.ts).getTime();
    if (t < range.start || t > range.end) {
      prev = s;
      continue;
    }
    if (prev && !prev.gateway_online && s.gateway_online) count += 1;
    prev = s;
  }
  return count;
}
