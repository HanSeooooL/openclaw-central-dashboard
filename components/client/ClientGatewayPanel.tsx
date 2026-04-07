"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { FullStatus, GatewayCommand, PendingCommand } from "@/lib/types";

interface ClientGatewayPanelProps {
  clientId: string;
  status: FullStatus;
}

type CommandStatus = { id: number; command: GatewayCommand; status: PendingCommand["status"]; result: string | null } | null;

export default function ClientGatewayPanel({ clientId, status }: ClientGatewayPanelProps) {
  const [busy, setBusy] = useState(false);
  const [activeCommand, setActiveCommand] = useState<CommandStatus>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const pollCommand = useCallback(async (commandId: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const maxAttempts = 30;
    let attempts = 0;

    intervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/clients/${clientId}/commands?id=${commandId}`);
        const data = await res.json();
        const cmd = data.command as PendingCommand;
        setActiveCommand({ id: cmd.id, command: cmd.command, status: cmd.status, result: cmd.result });

        if (cmd.status === "done" || cmd.status === "error" || attempts >= maxAttempts) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setBusy(false);
        }
      } catch {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setBusy(false);
      }
    }, 3000);
  }, [clientId]);

  async function issueCommand(command: GatewayCommand) {
    setBusy(true);
    setActiveCommand(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      const cmd = data.command as PendingCommand;
      setActiveCommand({ id: cmd.id, command, status: "pending", result: null });
      pollCommand(cmd.id);
    } catch (e) {
      setActiveCommand({ id: 0, command, status: "error", result: String(e) });
      setBusy(false);
    }
  }

  const commandLabel: Record<GatewayCommand, string> = {
    gateway_start: "시작",
    gateway_stop: "중지",
    gateway_restart: "재시작",
  };

  const commandStatusMsg = activeCommand
    ? activeCommand.status === "pending" ? `⏳ ${commandLabel[activeCommand.command]} 명령 대기 중 (Reporter 명령 폴링 30초 간격)`
    : activeCommand.status === "ack" ? `⚙️ ${commandLabel[activeCommand.command]} 명령 실행 중...`
    : activeCommand.status === "done" ? `✅ ${commandLabel[activeCommand.command]} 완료${activeCommand.result ? `: ${activeCommand.result}` : ""}`
    : `❌ ${commandLabel[activeCommand.command]} 실패${activeCommand.result ? `: ${activeCommand.result}` : ""}`
    : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>게이트웨이</h2>
          <p className="text-sm text-secondary mt-1">OpenClaw Gateway 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => issueCommand("gateway_start")}
            disabled={busy || status.gateway_online}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-30 transition-all"
          >
            ▶️ 시작
          </button>
          <button
            onClick={() => issueCommand("gateway_restart")}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-30 transition-all"
          >
            🔄 재시작
          </button>
          <button
            onClick={() => issueCommand("gateway_stop")}
            disabled={busy || !status.gateway_online}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[#ff385c]/8 text-rausch border border-[#ff385c]/20 hover:bg-[#ff385c]/15 disabled:opacity-30 transition-all"
          >
            ⏹ 중지
          </button>
        </div>
      </div>

      {commandStatusMsg && (
        <div className={`border rounded-card px-4 py-3 text-sm font-medium ${
          activeCommand?.status === "done" ? "bg-green-50 border-green-200 text-green-700" :
          activeCommand?.status === "error" ? "bg-[#ff385c]/5 border-[#ff385c]/20 text-rausch" :
          "bg-surface border-border-light text-secondary"
        }`}>
          {commandStatusMsg}
        </div>
      )}

      <p className="text-xs text-secondary bg-surface border border-border-light rounded-lg px-3 py-2">
        💡 명령은 Reporter Agent가 30초 간격으로 수신합니다. 명령 발행 후 최대 30초 지연이 발생할 수 있습니다.
      </p>

      {/* 게이트웨이 정보 */}
      <div className="bg-white shadow-card rounded-card p-6">
        <h3 className="text-sm font-semibold text-nearblack mb-4">게이트웨이 정보</h3>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: "상태", value: status.gateway_online ? "🟢 온라인" : "🔴 오프라인" },
            { label: "버전", value: `v${status.runtime_version}` },
            { label: "서비스", value: status.gateway_service_running ? "실행 중" : "중지됨" },
            { label: "PID", value: status.gateway_pid?.toString() || "-" },
            { label: "URL", value: status.gateway_url || "-" },
            { label: "호스트", value: status.gateway_host || "-" },
            { label: "IP", value: status.gateway_ip || "-" },
            { label: "플랫폼", value: status.gateway_platform || "-" },
            { label: "응답 시간", value: status.gateway_latency_ms != null ? `${status.gateway_latency_ms}ms` : "-" },
            { label: "업타임", value: status.gateway_uptime },
          ].map((item) => (
            <div key={item.label} className="flex justify-between py-2.5 border-b border-border-light">
              <span className="text-xs text-secondary font-medium">{item.label}</span>
              <span className="text-sm text-nearblack font-mono">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 채널 상태 */}
      {status.channels.length > 0 && (
        <div className="bg-white shadow-card rounded-card p-6">
          <h3 className="text-sm font-semibold text-nearblack mb-4">채널 상태</h3>
          <div className="space-y-3">
            {status.channels.map((ch) => (
              <div key={ch.name} className="flex items-center justify-between p-3 bg-surface rounded-badge">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ch.name === "Discord" ? "💜" : "✈️"}</span>
                  <div>
                    <p className="text-sm font-semibold text-nearblack">{ch.name}</p>
                    <p className="text-xs text-secondary">{ch.bot_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ch.latency_ms != null && <span className="text-xs text-secondary">{ch.latency_ms}ms</span>}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-xs font-medium ${
                    ch.status === "online"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-[#ff385c]/8 text-rausch border border-[#ff385c]/20"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${ch.status === "online" ? "bg-green-500" : "bg-[#ff385c]"}`} />
                    {ch.status === "online" ? "연결됨" : "끊어짐"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* 하트비트 */}
        {status.heartbeat_agents.length > 0 && (
          <div className="bg-white shadow-card rounded-card p-6">
            <h3 className="text-sm font-semibold text-nearblack mb-4">하트비트 설정</h3>
            <div className="space-y-2">
              {status.heartbeat_agents.map((h) => (
                <div key={h.agent_id} className="flex items-center justify-between py-2.5 border-b border-border-light">
                  <span className="text-sm text-nearblack font-medium">{h.agent_id}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-badge font-medium ${h.enabled ? "bg-green-50 text-green-700 border border-green-200" : "bg-surface text-secondary border border-border-light"}`}>
                    {h.enabled ? `⏰ ${h.interval}` : "비활성"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 메모리 플러그인 */}
        <div className="bg-white shadow-card rounded-card p-6">
          <h3 className="text-sm font-semibold text-nearblack mb-4">메모리 플러그인</h3>
          <div className="space-y-2">
            {[
              { label: "상태", value: status.memory_plugin_enabled ? "✅ 활성" : "비활성" },
              { label: "슬롯", value: status.memory_plugin_slot || "-" },
              { label: "MD 파일", value: `${status.memory_files_count}개` },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-border-light">
                <span className="text-xs text-secondary font-medium">{item.label}</span>
                <span className="text-sm text-nearblack font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
