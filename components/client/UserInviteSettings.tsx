"use client";

import { useEffect, useState } from "react";
import { useToastStore } from "@/stores/toastStore";

interface Props {
  clientId: string;
}

interface ClientUser {
  id: string;
  auth_user_id: string;
  email: string | null;
  role: "admin" | "viewer";
  created_at: string;
}

export default function UserInviteSettings({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const { addToast } = useToastStore();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/users`);
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "invite failed");
      setOk(`${email} 초대 완료 — magic link 이메일 발송됨`);
      addToast({ message: `${email} 초대 완료`, type: "success" });
      setEmail("");
      await load();
    } catch (err) {
      setError((err as Error).message);
      addToast({ message: "초대 실패", type: "error" });
    } finally {
      setInviting(false);
    }
  };

  const remove = async (userId: string) => {
    if (!confirm("이 사용자의 접근 권한을 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "delete failed");
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="bg-white shadow-card rounded-card p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h3 className="text-[15px] font-semibold text-nearblack">사용자 초대</h3>
          <p className="text-xs text-secondary mt-0.5">이 고객사 포털에 접근할 사용자 관리</p>
        </div>
        <span className="text-secondary text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 bg-rausch text-white rounded-lg text-sm font-semibold hover:bg-[#e0314f] disabled:opacity-50"
            >
              {inviting ? "초대 중..." : "초대"}
            </button>
          </form>

          {error && <div className="text-xs text-red-600">{error}</div>}
          {ok && <div className="text-xs text-green-600">{ok}</div>}

          <div className="space-y-1">
            <div className="text-xs text-secondary mb-1">
              {loading ? "로딩 중..." : `${users.length}명`}
            </div>
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{u.email ?? u.auth_user_id.slice(0, 8)}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                    {u.role}
                  </span>
                </div>
                <button
                  onClick={() => remove(u.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
