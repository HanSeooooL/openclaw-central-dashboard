"use client";

import { useEffect } from "react";
import { useAlertStore } from "@/stores/alertStore";
import type { ClientAlert } from "@/lib/types";

interface ClientAlertsPanelProps {
  clientId: string;
  initialAlerts: ClientAlert[];
}

const alertIcon: Record<ClientAlert["type"], string> = {
  gateway_offline: "🔴",
  gateway_offline_first: "🔴",
  task_failed: "⚡",
  channel_down: "📡",
};

const alertStyle: Record<ClientAlert["type"], string> = {
  gateway_offline: "border-[#ff385c]/20 bg-[#ff385c]/5",
  gateway_offline_first: "border-[#ff385c]/20 bg-[#ff385c]/5",
  task_failed: "border-amber-200 bg-amber-50",
  channel_down: "border-orange-200 bg-orange-50",
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString("ko-KR");
}

export default function ClientAlertsPanel({ clientId, initialAlerts }: ClientAlertsPanelProps) {
  const { alerts, setAlerts, markRead, dismiss, markAllRead } = useAlertStore();

  useEffect(() => {
    setAlerts(clientId, initialAlerts);
  }, [clientId, initialAlerts, setAlerts]);

  const clientAlerts = alerts.filter((a) => a.client_id === clientId);
  const unread = clientAlerts.filter((a) => !a.read);
  const read = clientAlerts.filter((a) => a.read);

  async function handleMarkAllRead() {
    markAllRead(clientId);
    await fetch(`/api/clients/${clientId}/alerts`, { method: "PATCH" });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>알림</h2>
          <p className="text-sm text-secondary mt-1">
            {unread.length > 0 ? `미읽음 ${unread.length}개` : "모두 읽음"}
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="px-4 py-2 text-xs bg-nearblack text-white rounded-lg hover:bg-[#3f3f3f] transition-colors font-medium"
          >
            전체 읽음 처리
          </button>
        )}
      </div>

      {clientAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-secondary space-y-3">
          <span className="text-4xl">🔔</span>
          <p className="text-sm font-medium">알림이 없습니다</p>
        </div>
      ) : (
        <>
          {unread.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-nearblack uppercase tracking-wider">미읽음</h3>
              {unread.map((alert) => (
                <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-card border ${alertStyle[alert.type]}`}>
                  <span className="text-xl flex-shrink-0">{alertIcon[alert.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-nearblack font-medium">{alert.message}</p>
                    <p className="text-xs text-secondary mt-1">{formatTs(alert.ts)}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => markRead(alert.id)} className="text-xs text-secondary hover:text-nearblack transition-colors font-medium">읽음</button>
                    <button onClick={() => dismiss(alert.id)} className="text-xs text-[#c1c1c1] hover:text-secondary transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {read.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-secondary uppercase tracking-wider">읽음</h3>
              {read.slice(0, 20).map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-3 rounded-card border border-border-light bg-surface opacity-60">
                  <span className="text-lg flex-shrink-0">{alertIcon[alert.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-secondary">{alert.message}</p>
                    <p className="text-xs text-secondary mt-1 opacity-70">{formatTs(alert.ts)}</p>
                  </div>
                  <button onClick={() => dismiss(alert.id)} className="text-xs text-[#c1c1c1] hover:text-secondary transition-colors flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
