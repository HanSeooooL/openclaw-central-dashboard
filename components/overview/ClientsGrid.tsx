"use client";

import { useEffect, useState } from "react";
import ClientCard from "./ClientCard";
import AddClientModal from "./AddClientModal";
import { useClientStore } from "@/stores/clientStore";
import { useAlertStore, getClientUnreadCount } from "@/stores/alertStore";
import { subscribeToAllClients } from "@/lib/realtime";
import { signOut } from "@/app/login/actions";
import type { Client, Snapshot } from "@/lib/types";

interface ClientsGridProps {
  initialClients: (Client & { latestSnapshot: Snapshot | null })[];
}

export default function ClientsGrid({ initialClients }: ClientsGridProps) {
  const { clients, setClients, updateClientSnapshot } = useClientStore();
  const alertState = useAlertStore();
  const [showAddModal, setShowAddModal] = useState(false);

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
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🦞</span>
            <h2 className="text-[28px] font-bold text-nearblack" style={{ lineHeight: 1.43 }}>전체 현황</h2>
          </div>
          <p className="text-sm text-secondary">등록된 OpenClaw 인스턴스 관제</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 text-xs font-medium flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rausch text-white hover:bg-[#e0314f] active:scale-[0.98] transition-all font-semibold"
          >
            <span>+</span>
            <span>고객사 추가</span>
          </button>
          <form action={signOut}>
            <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-secondary hover:text-rausch hover:bg-[#ff385c]/8 transition-all font-medium">
              <span>🚪</span>
              <span>로그아웃</span>
            </button>
          </form>
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
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs text-rausch hover:underline font-medium"
          >
            + 첫 번째 고객사 추가하기
          </button>
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
      {showAddModal && (
        <AddClientModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newClient) => {
            setClients([
              ...displayClients,
              { ...newClient, created_at: new Date().toISOString(), notes: null, latestSnapshot: null },
            ]);
          }}
        />
      )}
    </div>
  );
}
