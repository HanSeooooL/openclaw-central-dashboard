"use client";

import { useState } from "react";
import { useToastStore } from "@/stores/toastStore";

interface Props {
  clientId: string;
}

export default function TokenSettings({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [graceExpires, setGraceExpires] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { addToast } = useToastStore();

  const rotate = async () => {
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/rotate-token`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rotate failed");
      setNewToken(data.token);
      setGraceExpires(data.grace_expires);
      setConfirming(false);
      addToast({ message: "토큰이 재발급되었습니다", type: "success" });
    } catch (e) {
      setError((e as Error).message);
      addToast({ message: "토큰 재발급 실패", type: "error" });
    } finally {
      setRotating(false);
    }
  };

  const copy = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dismiss = () => {
    setNewToken(null);
    setGraceExpires(null);
  };

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-nearblack">Reporter 토큰</h3>
        <span className="text-[11px] text-secondary">{open ? "숨기기 ▲" : "관리 ▼"}</span>
      </button>

      {open && (
        <div className="mt-4">
          {!newToken && (
            <>
              <p className="text-xs text-secondary mb-3">
                Reporter 가 스냅샷을 전송할 때 사용하는 토큰을 새로 발급합니다. 이전 토큰은
                24 시간 동안 계속 유효합니다(교체 유예 기간). 교체 후 즉시 고객사 호스트의{" "}
                <code className="font-mono text-[11px]">~/.openclaw-reporter/config.json</code>{" "}
                의 <code className="font-mono text-[11px]">reporter_token</code> 을 업데이트해 주세요.
              </p>

              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  className="text-xs px-4 py-2 rounded border border-rausch text-rausch font-medium hover:bg-[#fff5f6]"
                >
                  토큰 재발급
                </button>
              ) : (
                <div className="border border-rausch/40 bg-[#fff5f6] rounded-lg p-3">
                  <p className="text-xs text-nearblack font-medium mb-2">정말 재발급하시겠어요?</p>
                  <p className="text-[11px] text-secondary mb-3">
                    새 토큰이 표시된 후에는 다시 볼 수 없습니다. 24시간 내에 reporter config 를 갱신하지
                    않으면 스냅샷 전송이 중단됩니다.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={rotate}
                      disabled={rotating}
                      className="text-xs px-4 py-2 rounded bg-rausch text-white font-medium disabled:opacity-50"
                    >
                      {rotating ? "발급 중..." : "재발급 진행"}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="text-xs px-4 py-2 rounded border border-border-light text-secondary"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <p className="text-[11px] text-rausch mt-2">❌ {error}</p>
              )}
            </>
          )}

          {newToken && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">
                ⚠ 새 토큰이 발급되었습니다 — 이 화면을 닫으면 다시 볼 수 없습니다
              </p>
              <div className="bg-white border border-amber-200 rounded p-2 font-mono text-[11px] break-all text-nearblack mb-2">
                {newToken}
              </div>
              <div className="flex gap-2 items-center mb-2">
                <button
                  onClick={copy}
                  className="text-xs px-3 py-1.5 rounded bg-nearblack text-white font-medium"
                >
                  {copied ? "✅ 복사됨" : "복사"}
                </button>
                <button
                  onClick={dismiss}
                  className="text-xs px-3 py-1.5 rounded border border-border-light text-secondary"
                >
                  확인했어요 (닫기)
                </button>
              </div>
              {graceExpires && (
                <p className="text-[11px] text-amber-900">
                  이전 토큰 유예 만료:{" "}
                  <span className="font-mono">{new Date(graceExpires).toLocaleString("ko-KR")}</span>
                </p>
              )}
              <details className="mt-3">
                <summary className="text-[11px] text-amber-900 cursor-pointer font-medium">
                  Reporter 교체 명령어 보기
                </summary>
                <pre className="mt-2 bg-white/60 rounded p-2 text-[10px] font-mono text-nearblack overflow-x-auto whitespace-pre-wrap break-all">{`# macOS
python3 -c "import json,sys; c=json.load(open('/Users/\\$(whoami)/.openclaw-reporter/config.json')); c['reporter_token']='${newToken}'; json.dump(c, open('/Users/\\$(whoami)/.openclaw-reporter/config.json','w'), indent=2)"
launchctl kickstart -k "gui/\\$(id -u)/com.openclaw.reporter"`}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
