"use client";

import type { FullStatus } from "@/lib/types";

interface ClientModelsPanelProps {
  status: FullStatus;
}

export default function ClientModelsPanel({ status }: ClientModelsPanelProps) {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-[22px] font-semibold text-nearblack" style={{ letterSpacing: "-0.44px" }}>모델 설정</h2>
        <p className="text-sm text-secondary mt-1">현재 고객사의 모델 및 API 키 구성 (읽기 전용)</p>
      </div>

      {/* 읽기 전용 안내 */}
      <div className="bg-surface border border-border-light rounded-card px-4 py-3 text-sm text-secondary flex items-center gap-2">
        <span>ℹ️</span>
        <span className="font-medium">모델 설정 변경은 고객사 서버에서 직접 관리됩니다. 여기서는 현재 설정을 확인할 수 있습니다.</span>
      </div>

      {/* 기본 모델 */}
      <div className="bg-white shadow-card rounded-card p-6">
        <h3 className="text-sm font-semibold text-nearblack mb-4">기본 모델</h3>
        <div className="flex items-center gap-3">
          <span className="text-xl w-10 h-10 bg-[#ff385c]/10 rounded-badge flex items-center justify-center">🤖</span>
          <div>
            <p className="text-base font-semibold text-rausch" style={{ letterSpacing: "-0.18px" }}>{status.default_model || "설정 없음"}</p>
            <p className="text-xs text-secondary mt-0.5">컨텍스트: {(status.default_context_tokens / 1000).toFixed(0)}k 토큰</p>
          </div>
        </div>
      </div>

      {/* 에이전트 정보 */}
      <div className="bg-white shadow-card rounded-card p-6">
        <h3 className="text-sm font-semibold text-nearblack mb-4">에이전트 구성</h3>
        <div className="space-y-1">
          {status.agents.length === 0 ? (
            <p className="text-xs text-secondary">에이전트 정보 없음</p>
          ) : (
            status.agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-border-light">
                <div className="flex items-center gap-2">
                  <span>{a.is_default ? "⭐" : "🤖"}</span>
                  <span className="text-sm text-nearblack font-medium">{a.id}</span>
                  {a.is_default && (
                    <span className="text-[10px] bg-[#ff385c]/10 text-rausch border border-[#ff385c]/20 px-1.5 py-0.5 rounded-badge font-semibold">기본</span>
                  )}
                </div>
                <div className="text-xs text-secondary font-medium">세션 {a.sessions_count}개</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 런타임 정보 */}
      <div className="bg-white shadow-card rounded-card p-6">
        <h3 className="text-sm font-semibold text-nearblack mb-4">런타임 정보</h3>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: "버전", value: `v${status.runtime_version}` },
            { label: "OS", value: status.os_label || "-" },
            { label: "플랫폼", value: status.gateway_platform || "-" },
            { label: "메모리 플러그인", value: status.memory_plugin_enabled ? "활성" : "비활성" },
            { label: "메모리 슬롯", value: status.memory_plugin_slot || "-" },
            { label: "MD 파일 수", value: `${status.memory_files_count}개` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2.5 border-b border-border-light">
              <span className="text-xs text-secondary font-medium">{label}</span>
              <span className="text-sm text-nearblack font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
