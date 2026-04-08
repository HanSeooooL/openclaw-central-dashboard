"use client";

import { useEffect, useState } from "react";

interface Props {
  clientId: string;
}

interface Config {
  email?: { enabled?: boolean; recipients?: string[] };
  slack?: { enabled?: boolean; webhook_url?: string };
  min_severity?: "info" | "warning" | "critical";
}

export default function NotificationSettings({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minSeverity, setMinSeverity] = useState<"info" | "warning" | "critical">("warning");

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/clients/${clientId}/notification-config`)
      .then((r) => r.json())
      .then((d) => {
        const c: Config = d.config ?? {};
        setEmailEnabled(!!c.email?.enabled);
        setRecipientsText((c.email?.recipients ?? []).join(", "));
        setSlackEnabled(!!c.slack?.enabled);
        setWebhookUrl(c.slack?.webhook_url ?? "");
        setMinSeverity(c.min_severity ?? "warning");
        setLoaded(true);
      })
      .catch((e) => setMessage(`불러오기 실패: ${e?.message ?? e}`));
  }, [open, loaded, clientId]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const config: Config = {
        email: {
          enabled: emailEnabled,
          recipients: recipientsText
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
        slack: { enabled: slackEnabled, webhook_url: webhookUrl.trim() },
        min_severity: minSeverity,
      };
      const res = await fetch(`/api/clients/${clientId}/notification-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setMessage("✅ 저장됨");
    } catch (e) {
      setMessage(`저장 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/notification-config`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "test failed");
      const notified = data.dispatch?.notified ?? {};
      const channels = Object.keys(notified);
      setMessage(
        channels.length > 0
          ? `✅ 테스트 전송 완료 (${channels.join(", ")})`
          : `⚠ 전송된 채널 없음 (설정을 저장하고 활성화했는지 확인하세요)`,
      );
    } catch (e) {
      setMessage(`테스트 실패: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-nearblack">알림 채널</h3>
        <span className="text-[11px] text-secondary">
          {open ? "숨기기 ▲" : "설정 ▼"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {!loaded ? (
            <p className="text-xs text-secondary">불러오는 중...</p>
          ) : (
            <>
              {/* Email */}
              <div className="border border-border-light rounded-lg p-3">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-nearblack">이메일 (Resend)</span>
                </label>
                <p className="text-[10px] text-secondary mb-1">수신자 이메일 (쉼표 또는 공백으로 구분)</p>
                <input
                  type="text"
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  placeholder="ops@acme.com, dev@acme.com"
                  className="w-full text-xs font-mono border border-border-light rounded px-2 py-1.5"
                />
              </div>

              {/* Slack */}
              <div className="border border-border-light rounded-lg p-3">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={slackEnabled}
                    onChange={(e) => setSlackEnabled(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-nearblack">Slack Webhook</span>
                </label>
                <p className="text-[10px] text-secondary mb-1">Incoming Webhook URL</p>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full text-xs font-mono border border-border-light rounded px-2 py-1.5"
                />
              </div>

              {/* Severity threshold */}
              <div className="border border-border-light rounded-lg p-3">
                <p className="text-[10px] text-secondary font-semibold uppercase tracking-wide mb-2">
                  최소 심각도
                </p>
                <div className="flex gap-2">
                  {(["info", "warning", "critical"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setMinSeverity(s)}
                      className={`text-xs px-3 py-1.5 rounded border ${
                        minSeverity === s
                          ? "bg-nearblack text-white border-nearblack"
                          : "bg-white text-secondary border-border-light hover:border-nearblack"
                      }`}
                    >
                      {s === "info" ? "모든 알림" : s === "warning" ? "경고 이상" : "치명적만"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-xs px-4 py-2 rounded bg-rausch text-white font-medium disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
                <button
                  onClick={sendTest}
                  disabled={testing}
                  className="text-xs px-4 py-2 rounded border border-border-light text-nearblack font-medium disabled:opacity-50"
                >
                  {testing ? "전송 중..." : "테스트 알림 전송"}
                </button>
                {message && (
                  <span className="text-[11px] text-secondary ml-2">{message}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
