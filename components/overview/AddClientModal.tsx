"use client";

import { useState, useEffect } from "react";

interface AddClientModalProps {
  onClose: () => void;
  onAdded: (client: { id: string; name: string; slug: string }) => void;
}

function generateToken(length = 48) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const limit = Math.floor(256 / chars.length) * chars.length; // 248 → modulo bias 제거
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && result.length < length) {
        result.push(chars[b % chars.length]);
      }
    }
  }
  return result.join("");
}

const INSTALL_SCRIPT_BASE =
  "https://raw.githubusercontent.com/HanSeooooL/openclaw-central-dashboard/main/reporter/install.sh";

export default function AddClientModal({ onClose, onAdded }: AddClientModalProps) {
  const [step, setStep] = useState<"form" | "done">("form");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [notes, setNotes] = useState("");
  const [token, setToken] = useState(() => generateToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdClient, setCreatedClient] = useState<{ id: string; name: string; slug: string } | null>(null);

  // name → slug 자동 변환
  useEffect(() => {
    setSlug(
      name
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 32)
    );
  }, [name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, token, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      setCreatedClient(data.client);
      onAdded(data.client);
      setStep("done");
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  }

  const installCmd = createdClient
    ? `curl -fsSL ${INSTALL_SCRIPT_BASE} \\\n  | bash -s -- \\\n  --token ${token} \\\n  --client-id ${createdClient.id}`
    : "";

  async function copyCmd() {
    await navigator.clipboard.writeText(
      installCmd.replace(/\\\n\s*/g, " ")
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-white rounded-card shadow-card-hover w-full max-w-lg">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 bg-[#ff385c]/10 rounded-badge flex items-center justify-center text-base">🏢</span>
            <h2 className="text-base font-bold text-nearblack">
              {step === "form" ? "고객사 추가" : "설치 안내"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:bg-surface hover:text-nearblack transition-all text-lg"
          >
            ×
          </button>
        </div>

        {/* ── 1단계: 폼 ── */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nearblack">회사명 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 주식회사 샘플"
                className="w-full px-3 py-2.5 rounded-xl border border-border-light text-sm text-nearblack placeholder:text-[#c1c1c1] focus:outline-none focus:ring-2 focus:ring-rausch/30 focus:border-rausch transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nearblack">슬러그 *</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="예: sample-corp"
                className="w-full px-3 py-2.5 rounded-xl border border-border-light text-sm text-nearblack placeholder:text-[#c1c1c1] focus:outline-none focus:ring-2 focus:ring-rausch/30 focus:border-rausch transition-all font-mono"
              />
              <p className="text-[11px] text-secondary">영문·숫자·하이픈, URL 식별자로 사용됩니다</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-nearblack">Reporter 토큰 *</label>
                <button
                  type="button"
                  onClick={() => setToken(generateToken())}
                  className="text-[11px] text-rausch hover:underline font-medium"
                >
                  재생성
                </button>
              </div>
              <input
                type="text"
                readOnly
                value={token}
                className="w-full px-3 py-2.5 rounded-xl border border-border-light text-sm text-secondary bg-surface font-mono cursor-default"
              />
              <p className="text-[11px] text-secondary">설치 후 변경 불가 — 안전하게 보관하세요</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nearblack">메모 <span className="font-normal text-secondary">(선택)</span></label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="예: 2024 계약, 서울 오피스"
                className="w-full px-3 py-2.5 rounded-xl border border-border-light text-sm text-nearblack placeholder:text-[#c1c1c1] focus:outline-none focus:ring-2 focus:ring-rausch/30 focus:border-rausch transition-all"
              />
            </div>

            {error && (
              <p className="text-xs text-rausch bg-[#ff385c]/8 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border-light text-sm font-semibold text-secondary hover:bg-surface transition-all"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading || !name || !slug}
                className="flex-1 py-2.5 rounded-xl bg-rausch text-white text-sm font-semibold hover:bg-[#e0314f] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        )}

        {/* ── 2단계: 설치 안내 ── */}
        {step === "done" && createdClient && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2.5 p-3 bg-green-50 rounded-xl border border-green-100">
              <span className="text-lg">✅</span>
              <div>
                <p className="text-sm font-semibold text-nearblack">{createdClient.name} 등록 완료</p>
                <p className="text-xs text-secondary mt-0.5">고객사 서버에서 아래 명령어를 실행하세요</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-nearblack">Reporter 설치 명령어</p>
              <div className="relative">
                <pre className="bg-[#1a1a1a] text-[#e8e8e8] text-xs rounded-xl p-4 overflow-x-auto leading-relaxed font-mono whitespace-pre">{installCmd}</pre>
                <button
                  onClick={copyCmd}
                  className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-white/10 text-[#e8e8e8] hover:bg-white/20"
                  }`}
                >
                  {copied ? "복사됨 ✓" : "복사"}
                </button>
              </div>
              <p className="text-[11px] text-secondary">Node.js 22+ 필요 · OpenClaw 설치 서버에서 실행하세요 · Gateway 토큰은 자동으로 감지됩니다</p>
            </div>

            <div className="bg-surface rounded-xl p-3 space-y-1.5 text-xs text-secondary">
              <p className="font-semibold text-nearblack text-[11px] uppercase tracking-wide">설치 정보</p>
              <div className="flex justify-between">
                <span>Client ID</span>
                <span className="font-mono text-nearblack">{createdClient.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Token</span>
                <span className="font-mono text-nearblack">{token.slice(0, 8)}••••••••</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-rausch text-white text-sm font-semibold hover:bg-[#e0314f] transition-all"
            >
              완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
