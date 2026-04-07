"use client";

import { useState, useTransition } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#ff385c]/10 rounded-card mb-4">
            <span className="text-3xl">🦞</span>
          </div>
          <h1 className="text-2xl font-bold text-nearblack">OpenClaw 관제</h1>
          <p className="text-sm text-secondary mt-1">계속하려면 로그인하세요</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-card shadow-card p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nearblack" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-border-light bg-white text-sm text-nearblack placeholder:text-[#c1c1c1] focus:outline-none focus:ring-2 focus:ring-rausch/30 focus:border-rausch transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nearblack" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-xl border border-border-light bg-white text-sm text-nearblack placeholder:text-[#c1c1c1] focus:outline-none focus:ring-2 focus:ring-rausch/30 focus:border-rausch transition-all"
              />
            </div>

            {error && (
              <p className="text-xs text-rausch bg-[#ff385c]/8 rounded-lg px-3 py-2">
                {error === "Invalid login credentials"
                  ? "이메일 또는 비밀번호가 올바르지 않습니다"
                  : error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 bg-rausch text-white rounded-xl text-sm font-semibold hover:bg-[#e0314f] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
