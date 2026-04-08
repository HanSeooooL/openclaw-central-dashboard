"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAlertStore } from "@/stores/alertStore";
import type { ClientAlert, AlertMetadata } from "@/lib/types";

// ─────────────────────────────────────────
// Layer 5 — Incident Feed
// 대시보드 하단에 최근 알림 10건을 인라인으로 붙인다.
// 각 알림은 해당 시점 debug_* 에러와 자원 스냅샷을 expandable 로 노출해
// "이 장애 때 무슨 일이 있었는지"를 페이지 이동 없이 확인할 수 있게 한다.
// ─────────────────────────────────────────

interface IncidentFeedProps {
  clientId: string;
}

const TYPE_META: Record<
  ClientAlert["type"],
  { icon: string; label: string; tone: string }
> = {
  gateway_offline: {
    icon: "⛔",
    label: "게이트웨이 오프라인",
    tone: "border-[#ff385c]/25 bg-[#ff385c]/5",
  },
  gateway_offline_first: {
    icon: "⛔",
    label: "초기 오프라인",
    tone: "border-[#ff385c]/25 bg-[#ff385c]/5",
  },
  task_failed: {
    icon: "✕",
    label: "태스크 실패",
    tone: "border-amber-300 bg-amber-50",
  },
  channel_down: {
    icon: "⚠",
    label: "채널 다운",
    tone: "border-amber-300 bg-amber-50",
  },
};

function formatRelative(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = Math.floor(diff / 86400);
  if (d < 7) return `${d}일 전`;
  return new Date(ts).toLocaleDateString("ko-KR");
}

function hasMetaContent(meta: AlertMetadata | null): boolean {
  if (!meta) return false;
  return Boolean(
    meta.debug_gateway_error ||
      meta.debug_status_error ||
      meta.debug_health_error ||
      meta.cpu_usage != null ||
      meta.memory_percent != null ||
      meta.disk_percent != null ||
      meta.gateway_uptime
  );
}

function IncidentRow({ alert }: { alert: ClientAlert }) {
  const [open, setOpen] = useState(false);
  const meta = alert.metadata;
  const expandable = hasMetaContent(meta);
  const t = TYPE_META[alert.type];

  const errors = meta
    ? ([
        meta.debug_gateway_error && { label: "gateway", text: meta.debug_gateway_error },
        meta.debug_status_error && { label: "status", text: meta.debug_status_error },
        meta.debug_health_error && { label: "health", text: meta.debug_health_error },
      ].filter(Boolean) as { label: string; text: string }[])
    : [];

  return (
    <div
      className={`rounded-card border p-3 ${t.tone} ${
        alert.read ? "opacity-65" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-base leading-none mt-0.5">{t.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-[10px] text-secondary font-semibold uppercase tracking-wide">
              {t.label}
            </span>
            <span className="text-[10px] text-secondary">
              {formatRelative(alert.ts)}
            </span>
          </div>
          <p className="text-sm text-nearblack mt-0.5">{alert.message}</p>

          {expandable && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-2 text-[11px] text-secondary hover:text-nearblack underline decoration-dotted font-medium"
            >
              {open ? "상세 숨기기" : "상세 보기"}
            </button>
          )}

          {open && meta && (
            <div className="mt-2 space-y-2">
              {/* 자원/게이트웨이 스냅샷 */}
              {(meta.cpu_usage != null ||
                meta.memory_percent != null ||
                meta.disk_percent != null ||
                meta.gateway_uptime ||
                meta.gateway_latency_ms != null) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white/60 rounded p-2">
                  {meta.cpu_usage != null && (
                    <MetaStat label="CPU" value={`${meta.cpu_usage.toFixed(0)}%`} />
                  )}
                  {meta.memory_percent != null && (
                    <MetaStat
                      label="메모리"
                      value={`${meta.memory_percent.toFixed(0)}%`}
                    />
                  )}
                  {meta.disk_percent != null && (
                    <MetaStat
                      label="디스크"
                      value={`${meta.disk_percent.toFixed(0)}%`}
                    />
                  )}
                  {meta.gateway_latency_ms != null && (
                    <MetaStat
                      label="레이턴시"
                      value={`${meta.gateway_latency_ms}ms`}
                    />
                  )}
                  {meta.gateway_uptime && (
                    <MetaStat label="uptime" value={meta.gateway_uptime} />
                  )}
                </div>
              )}

              {/* debug 에러 원문 */}
              {errors.map((e) => (
                <div key={e.label} className="bg-white/60 rounded p-2">
                  <p className="text-[9px] text-secondary font-mono font-semibold uppercase">
                    {e.label} error
                  </p>
                  <pre className="text-[10px] text-nearblack font-mono whitespace-pre-wrap break-all mt-1">
                    {e.text}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-secondary uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-nearblack tabular-nums">{value}</p>
    </div>
  );
}

export default function IncidentFeed({ clientId }: IncidentFeedProps) {
  const { alerts, setAlerts } = useAlertStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clients/${clientId}/alerts`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAlerts(clientId, d.alerts ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, setAlerts]);

  const clientAlerts = alerts
    .filter((a) => a.client_id === clientId)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 10);

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-nearblack">최근 이벤트</h3>
        <Link
          href={`/clients/${clientId}/alerts`}
          className="text-[11px] text-secondary hover:text-nearblack underline decoration-dotted"
        >
          전체 알림 →
        </Link>
      </div>

      {!loaded ? (
        <p className="text-xs text-secondary py-4">불러오는 중...</p>
      ) : clientAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-secondary text-xs space-y-1">
          <span className="text-2xl">✓</span>
          <p>최근 이벤트가 없습니다</p>
          <p className="text-[10px] text-[#c1c1c1]">정상 운영 중입니다</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {clientAlerts.map((a) => (
            <IncidentRow key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
