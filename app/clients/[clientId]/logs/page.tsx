"use client";

import { useEffect, useState } from "react";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";
import { useClientStore } from "@/stores/clientStore";

interface PageProps {
  params: { clientId: string };
}

export default function LogsPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus } = useClientStore();
  const data = dataMap[clientId];
  const status = data?.status;

  useEffect(() => {
    fetch(`/api/clients/${clientId}/snapshots?hours=1`)
      .then((r) => r.json())
      .then((d) => {
        const snaps: Snapshot[] = d.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(clientId, latest.full_status as FullStatus, latest.system_info as SystemInfo);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const debugErrors = [
    status?.debug_status_error,
    status?.debug_health_error,
    status?.debug_gateway_error,
  ].filter(Boolean);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-white">로그</h2>
        <p className="text-sm text-gray-500 mt-1">Reporter가 수집한 진단 정보</p>
      </div>

      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-300">
        💡 로그 스트리밍은 Reporter Agent가 설치된 경우 full_status의 debug 필드로 수집됩니다.
        실시간 로그를 보려면 고객사 서버에 직접 접속하거나 Reporter를 통한 로그 수집 기능을 확장하세요.
      </div>

      {debugErrors.length > 0 ? (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 font-mono text-xs space-y-3">
          <p className="text-red-400 font-semibold">⚠️ 연결 진단 오류</p>
          {status?.debug_bin && (
            <p className="text-gray-400">binary: <span className="text-gray-200">{status.debug_bin}</span></p>
          )}
          {status?.debug_gateway_error && (
            <p className="text-red-300">gateway error: {status.debug_gateway_error}</p>
          )}
          {status?.debug_status_error && (
            <div>
              <p className="text-orange-400">status --json 실패:</p>
              <pre className="text-gray-400 whitespace-pre-wrap break-all mt-1 bg-black/30 p-2 rounded">
                {status.debug_status_error.slice(0, 500)}
              </pre>
            </div>
          )}
          {status?.debug_health_error && (
            <p className="text-orange-400">health 실패: {status.debug_health_error.slice(0, 200)}</p>
          )}
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 font-mono text-xs">
          <p className="text-gray-500 text-center py-8">
            {data?.loading ? "로딩 중..." : "연결 오류 없음. Reporter가 정상 운영 중입니다."}
          </p>
        </div>
      )}

      {/* 최근 스냅샷 메타 정보 */}
      {status && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">마지막 수집 데이터</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: "버전", value: `v${status.runtime_version}` },
              { label: "OS", value: status.os_label || "-" },
              { label: "게이트웨이", value: status.gateway_online ? "🟢 온라인" : "🔴 오프라인" },
              { label: "세션 수", value: status.session_count },
              { label: "기본 에이전트", value: status.default_agent_id },
              { label: "마지막 수집", value: data?.lastSeen ? new Date(data.lastSeen).toLocaleString("ko-KR") : "-" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-gray-800/50">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-200 font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
