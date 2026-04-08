"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Legend,
} from "recharts";
import type { Snapshot } from "@/lib/types";

// ─────────────────────────────────────────
// Layer 3 — Unified Timeline
// 하나의 큰 시계열 차트. 탭으로 메트릭 교체, 기간 토글은 독립(zoom 용도).
// 공통: 재시작(빨간 세로선), 오프라인 구간(회색 밴드) 오버레이.
// ─────────────────────────────────────────

interface UnifiedTimelineProps {
  snapshots: Snapshot[];
}

type TabId = "usage" | "resource" | "latency";
type PeriodId = "1h" | "6h" | "24h" | "7d";

const TABS: { id: TabId; label: string }[] = [
  { id: "usage", label: "사용량" },
  { id: "resource", label: "자원" },
  { id: "latency", label: "응답성" },
];

const PERIODS: { id: PeriodId; label: string; hours: number }[] = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 168 },
];

function formatTs(ts: number, hours: number): string {
  const d = new Date(ts);
  if (hours <= 6)
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (hours <= 48)
    return d.toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

interface Overlay {
  offlineBands: { start: number; end: number }[];
  restarts: number[];
}

/** 오프라인 구간과 재시작(오프라인→온라인 전환) 시각을 추출 */
function buildOverlays(sorted: Snapshot[]): Overlay {
  const bands: { start: number; end: number }[] = [];
  const restarts: number[] = [];
  let offlineStart: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const t = new Date(s.ts).getTime();
    if (!s.gateway_online) {
      if (offlineStart === null) offlineStart = t;
    } else {
      if (offlineStart !== null) {
        bands.push({ start: offlineStart, end: t });
        restarts.push(t);
        offlineStart = null;
      }
    }
  }
  // 아직 오프라인 중이면 마지막까지 연장
  if (offlineStart !== null && sorted.length > 0) {
    bands.push({
      start: offlineStart,
      end: new Date(sorted[sorted.length - 1].ts).getTime(),
    });
  }
  return { offlineBands: bands, restarts };
}

export default function UnifiedTimeline({ snapshots }: UnifiedTimelineProps) {
  const [tab, setTab] = useState<TabId>("usage");
  const [period, setPeriod] = useState<PeriodId>("24h");

  const hours = PERIODS.find((p) => p.id === period)!.hours;

  const { data, overlay } = useMemo(() => {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const sorted = [...snapshots]
      .filter((s) => new Date(s.ts).getTime() >= cutoff)
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // delta 값을 미리 계산 — 사용량 탭에서 "기간 내 실제 증가분"을 보여주기 위함
    let prev: Snapshot | null = null;
    const rows = sorted.map((s) => {
      const t = new Date(s.ts).getTime();
      let dTok = 0;
      let dCost = 0;
      if (prev) {
        const dtok = s.total_tokens - prev.total_tokens;
        const dcost = Number(s.total_cost_usd) - Number(prev.total_cost_usd);
        if (dtok > 0) dTok = dtok;
        if (dcost > 0) dCost = dcost;
      }
      prev = s;
      return {
        t,
        time: formatTs(t, hours),
        // 사용량 (delta)
        tokens: Math.round(dTok / 1000),
        costCents: parseFloat((dCost * 100).toFixed(3)),
        // 자원
        cpu: s.system_info?.cpu_usage ?? null,
        memory: s.system_info?.memory_percent ?? null,
        disk: s.system_info?.disk_percent ?? null,
        // 응답성
        latency: s.gateway_latency_ms ?? null,
        // 세션
        sessions: s.session_count,
        _online: s.gateway_online,
      };
    });

    return { data: rows, overlay: buildOverlays(sorted) };
  }, [snapshots, hours]);

  const isEmpty = data.length < 2;

  const xDomain: [number, number] | undefined =
    data.length > 0 ? [data[0].t, data[data.length - 1].t] : undefined;

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex bg-surface rounded-lg p-1 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
                tab === t.id
                  ? "bg-nearblack text-white"
                  : "text-secondary hover:text-nearblack"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex bg-surface rounded-lg p-1 gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
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

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-60 text-secondary text-xs space-y-2">
          <span className="text-3xl">📊</span>
          <p>{period} 기간 내 데이터가 부족합니다</p>
          <p className="text-[10px] text-[#c1c1c1]">
            세션 변화 시 스냅샷이 수집됩니다
          </p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f2" />
              <XAxis
                dataKey="t"
                type="number"
                domain={xDomain as [number, number]}
                scale="time"
                tick={{ fontSize: 10, fill: "#6a6a6a" }}
                tickFormatter={(v) => formatTs(v as number, hours)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e8e8e8",
                  borderRadius: 12,
                  fontSize: 11,
                  boxShadow:
                    "rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px",
                }}
                labelStyle={{ color: "#6a6a6a" }}
                labelFormatter={(v) => formatTs(v as number, hours)}
              />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                iconType="plainline"
                iconSize={16}
              />

              {tab === "usage" && (
                <>
                  <YAxis
                    yAxisId="tok"
                    tick={{ fontSize: 10, fill: "#6a6a6a" }}
                    width={36}
                    label={{
                      value: "k tok",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 9, fill: "#6a6a6a" },
                    }}
                  />
                  <YAxis
                    yAxisId="cost"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#6a6a6a" }}
                    width={36}
                  />
                  {overlay.offlineBands.map((b, i) => (
                    <ReferenceArea
                      key={`band-${i}`}
                      yAxisId="tok"
                      x1={b.start}
                      x2={b.end}
                      fill="#6a6a6a"
                      fillOpacity={0.12}
                      ifOverflow="extendDomain"
                    />
                  ))}
                  {overlay.restarts.map((r, i) => (
                    <ReferenceLine
                      key={`r-${i}`}
                      yAxisId="tok"
                      x={r}
                      stroke="#ff385c"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                  ))}
                  <Bar
                    yAxisId="tok"
                    dataKey="tokens"
                    name="토큰 (k, 증가분)"
                    fill="#ff385c"
                    fillOpacity={0.85}
                    barSize={hours <= 1 ? 24 : hours <= 6 ? 18 : hours <= 24 ? 12 : 6}
                    minPointSize={3}
                  />
                  <Line
                    yAxisId="cost"
                    type="monotone"
                    dataKey="costCents"
                    name="비용 (¢, 증가분)"
                    stroke="#c8a000"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </>
              )}

              {tab === "resource" && (
                <>
                  <YAxis
                    yAxisId="pct"
                    tick={{ fontSize: 10, fill: "#6a6a6a" }}
                    width={32}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  {overlay.offlineBands.map((b, i) => (
                    <ReferenceArea
                      key={`band-${i}`}
                      yAxisId="pct"
                      x1={b.start}
                      x2={b.end}
                      fill="#6a6a6a"
                      fillOpacity={0.12}
                      ifOverflow="extendDomain"
                    />
                  ))}
                  {overlay.restarts.map((r, i) => (
                    <ReferenceLine
                      key={`r-${i}`}
                      yAxisId="pct"
                      x={r}
                      stroke="#ff385c"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                  ))}
                  <ReferenceLine
                    yAxisId="pct"
                    y={80}
                    stroke="#c8a000"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="cpu"
                    name="CPU"
                    stroke="#ff385c"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="memory"
                    name="메모리"
                    stroke="#c8a000"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="disk"
                    name="디스크"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                </>
              )}

              {tab === "latency" && (
                <>
                  <YAxis
                    yAxisId="lat"
                    tick={{ fontSize: 10, fill: "#6a6a6a" }}
                    width={36}
                    label={{
                      value: "ms",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 9, fill: "#6a6a6a" },
                    }}
                  />
                  <YAxis
                    yAxisId="sess"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#6a6a6a" }}
                    width={28}
                  />
                  {overlay.offlineBands.map((b, i) => (
                    <ReferenceArea
                      key={`band-${i}`}
                      yAxisId="lat"
                      x1={b.start}
                      x2={b.end}
                      fill="#6a6a6a"
                      fillOpacity={0.12}
                      ifOverflow="extendDomain"
                    />
                  ))}
                  {overlay.restarts.map((r, i) => (
                    <ReferenceLine
                      key={`r-${i}`}
                      yAxisId="lat"
                      x={r}
                      stroke="#ff385c"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                  ))}
                  <Line
                    yAxisId="lat"
                    type="monotone"
                    dataKey="latency"
                    name="게이트웨이 (ms)"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="sess"
                    type="monotone"
                    dataKey="sessions"
                    name="세션 수"
                    stroke="#8b5cf6"
                    strokeWidth={1}
                    dot={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* 범례 보조 — 오버레이 의미 설명 */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-secondary">
            {overlay.offlineBands.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-[#6a6a6a]/20 rounded-sm" />
                오프라인 구간
              </span>
            )}
            {overlay.restarts.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t border-dashed border-rausch" />
                재시작 ({overlay.restarts.length}회)
              </span>
            )}
            {tab === "resource" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t border-dashed border-[#c8a000]" />
                80% 임계값
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
