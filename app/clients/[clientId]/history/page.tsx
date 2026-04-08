"use client";

import { useEffect, useState } from "react";
import ClientAlertsPanel from "@/components/client/ClientAlertsPanel";
import { useClientStore } from "@/stores/clientStore";
import type { ClientAlert, FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

/**
 * History — alerts + logs 통합 페이지
 * 장애·알림 타임라인과 Reporter 진단 에러를 한 페이지에서 조회.
 */
export default function HistoryPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus } = useClientStore();
  const data = dataMap[clientId];
  const status = data?.status;
  const [alerts, setAlerts] = useState<ClientAlert[]>([]);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/alerts`)
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => {});

    fetch(`/api/clients/${clientId}/snapshots?hours=1`)
      .then((r) => r.json())
      .then((d) => {
        const snaps: Snapshot[] = d.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(
            clientId,
            latest.full_status as FullStatus,
            latest.system_info as SystemInfo
          );
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const debugFields = [
    status?.debug_gateway_error && { label: "gateway", text: status.debug_gateway_error },
    status?.debug_status_error && { label: "status --json", text: status.debug_status_error },
    status?.debug_health_error && { label: "/health", text: status.debug_health_error },
  ].filter(Boolean) as { label: string; text: string }[];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2
          className="text-[22px] font-semibold text-nearblack"
          style={{ letterSpacing: "-0.44px" }}
        >
          기록
        </h2>
        <p className="text-sm text-secondary mt-1">
          알림 이력과 Reporter 진단 에러를 한 페이지에서 확인합니다.
        </p>
      </div>

      {/* Reporter 진단 에러 — 현재 수집된 debug 필드가 있으면 상단에 노출 */}
      {debugFields.length > 0 && (
        <div className="bg-white shadow-card rounded-card p-5 border border-[#ff385c]/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rausch">⚠</span>
            <h3 className="text-sm font-semibold text-nearblack">
              Reporter 진단 에러 (현재 스냅샷 기준)
            </h3>
          </div>
          <p className="text-[11px] text-secondary mb-3">
            Reporter가 openclaw CLI·health 엔드포인트를 호출하다 실패한 마지막 에러 원문입니다.
          </p>
          <div className="space-y-2">
            {status?.debug_bin && (
              <p className="text-[11px] text-secondary">
                binary: <span className="font-mono text-nearblack">{status.debug_bin}</span>
              </p>
            )}
            {debugFields.map((f) => (
              <div key={f.label} className="bg-surface rounded p-2.5">
                <p className="text-[9px] text-secondary font-mono font-semibold uppercase">
                  {f.label}
                </p>
                <pre className="text-[10px] text-nearblack font-mono whitespace-pre-wrap break-all mt-1">
                  {f.text}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 게이트웨이 로그 (WARN/ERROR) */}
      {Array.isArray(status?.recent_log_lines) && status.recent_log_lines.length > 0 && (
        <div className="bg-white shadow-card rounded-card p-5">
          <h3 className="text-sm font-semibold text-nearblack mb-2">
            최근 gateway 로그 (WARN/ERROR · {status.recent_log_lines.length})
          </h3>
          <p className="text-[11px] text-secondary mb-3">
            장애 후 들어오셨다면 여기서 직전 원인을 빠르게 확인하세요.
          </p>
          <div className="space-y-0.5 max-h-96 overflow-y-auto">
            {status.recent_log_lines.map((l, i) => (
              <div key={i} className="text-[11px] font-mono leading-tight">
                <span className="text-[#999]">{l.ts}</span>{" "}
                <span
                  className={l.level === "ERROR" ? "text-rausch" : "text-amber-700"}
                >
                  [{l.level}]
                </span>{" "}
                <span className="text-[#999]">{l.subsystem ?? ""}</span>{" "}
                <span className="text-nearblack break-all">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 알림 타임라인 */}
      <ClientAlertsPanel clientId={clientId} initialAlerts={alerts} />
    </div>
  );
}
