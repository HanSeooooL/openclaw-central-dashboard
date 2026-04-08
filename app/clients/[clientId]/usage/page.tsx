"use client";

import { useEffect } from "react";
import ClientCostAnalysis from "@/components/client/ClientCostAnalysis";
import ClientModelsPanel from "@/components/client/ClientModelsPanel";
import { useClientStore } from "@/stores/clientStore";
import { EMPTY_STATUS } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

/**
 * Usage — costs + models 통합 페이지
 * 비용 분석(모델별 breakdown, 기간별) + 모델 설정(기본 모델, 에이전트, 런타임)을 한 곳에.
 */
export default function UsagePage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus, setSnapshots } = useClientStore();
  const data = dataMap[clientId];

  useEffect(() => {
    fetch(`/api/clients/${clientId}/snapshots?hours=168`)
      .then((r) => r.json())
      .then((d) => setSnapshots(clientId, d.snapshots ?? []))
      .catch(() => {});

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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h2
          className="text-[22px] font-semibold text-nearblack"
          style={{ letterSpacing: "-0.44px" }}
        >
          사용 & 모델
        </h2>
        <p className="text-sm text-secondary mt-1">
          토큰 소비, 추정 비용, 모델 구성을 한 곳에서 확인합니다.
        </p>
      </div>

      <ClientCostAnalysis
        status={data?.status ?? EMPTY_STATUS}
        snapshots={data?.snapshots ?? []}
        loading={data?.loading ?? true}
      />

      <div>
        <h3 className="text-sm font-semibold text-nearblack mb-3">모델 & 런타임</h3>
        <ClientModelsPanel status={data?.status ?? EMPTY_STATUS} />
      </div>
    </div>
  );
}
