"use client";

import { useEffect } from "react";
import ClientCard from "./ClientCard";
import { useClientStore } from "@/stores/clientStore";
import { useAlertStore, getClientUnreadCount } from "@/stores/alertStore";
import { subscribeToAllClients } from "@/lib/realtime";
import type { Client, Snapshot } from "@/lib/types";

interface ClientsGridProps {
  initialClients: (Client & { latestSnapshot: Snapshot | null })[];
}

export default function ClientsGrid({ initialClients }: ClientsGridProps) {
  const { clients, setClients, updateClientSnapshot } = useClientStore();
  const alertState = useAlertStore();

  useEffect(() => {
    setClients(initialClients);
  }, [initialClients, setClients]);

  useEffect(() => {
    const ids = initialClients.map((c) => c.id);
    if (ids.length === 0) return;
    const cleanup = subscribeToAllClients(ids, { updateClientSnapshot });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayClients = clients.length > 0 ? clients : initialClients;

  const onlineCount = displayClients.filter((c) => c.latestSnapshot?.gateway_online).length;
  const offlineCount = displayClients.filter(
    (c) => c.latestSnapshot && !c.latestSnapshot.gateway_online
  ).length;
  const disconnectedCount = displayClients.filter((c) => !c.latestSnapshot).length;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-bold text-nearblack" style={{ lineHeight: 1.43 }}>전체 현황</h2>
          <p className="text-sm text-secondary mt-1">등록된 OpenClaw 인스턴스 관제</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-secondary">온라인 {onlineCount}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff385c]" />
            <span className="text-secondary">오프라인 {offlineCount}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#c1c1c1]" />
            <span className="text-secondary">미연결 {disconnectedCount}</span>
          </span>
        </div>
      </div>

      {/* 고객사 그리드 */}
      {displayClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-secondary space-y-3">
          <span className="text-4xl">🏢</span>
          <p className="text-sm font-medium">등록된 고객사가 없습니다</p>
          <p className="text-xs text-[#c1c1c1]">API를 통해 고객사를 등록하고 Reporter를 설치하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {displayClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              latestSnapshot={client.latestSnapshot}
              unreadAlerts={getClientUnreadCount(alertState, client.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
