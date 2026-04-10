"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAlertStore } from "@/stores/alertStore";
import { signOut } from "@/app/login/actions";

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "대시보드", icon: "📊", path: "dashboard" },
  { label: "세션", icon: "💬", path: "sessions" },
  { label: "사용", icon: "💰", path: "usage" },
  { label: "기록", icon: "🔔", path: "history" },
  { label: "게이트웨이", icon: "🌐", path: "gateway" },
];

// 하단 탭에 고정 노출 (4개 + 더보기). 게이트웨이는 자주 쓰지 않으므로 더보기로.
const PRIMARY_TAB_PATHS = ["dashboard", "sessions", "usage", "history"];
const PRIMARY_TABS = NAV_ITEMS.filter((i) => PRIMARY_TAB_PATHS.includes(i.path));
// 더보기 드로어에만 표시
const SECONDARY_ITEMS = NAV_ITEMS.filter((i) => !PRIMARY_TAB_PATHS.includes(i.path));

interface ClientSidebarProps {
  clientId: string;
  clientName: string;
}

export default function ClientSidebar({ clientId, clientName }: ClientSidebarProps) {
  const pathname = usePathname();
  const unreadCount = useAlertStore((s) => s.alerts.filter((a) => a.client_id === clientId && !a.read).length);
  const [moreOpen, setMoreOpen] = useState(false);

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {/* 로고 영역 */}
      <div className="p-4 border-b border-border-light">
        <Link
          href="/clients"
          onClick={onNavigate}
          className="flex items-center gap-1.5 text-secondary hover:text-nearblack transition-colors mb-3 text-xs font-medium"
        >
          <span>←</span>
          <span>전체 목록</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-lg w-8 h-8 bg-[#ff385c]/10 rounded-badge flex items-center justify-center flex-shrink-0">🦞</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-nearblack truncate">{clientName}</p>
            <p className="text-[10px] text-secondary">OpenClaw 관제</p>
          </div>
        </div>
      </div>

      {/* 메인 네비게이션 */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const href = `/clients/${clientId}/${item.path}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          const showBadge = item.path === "history" && unreadCount > 0;

          return (
            <Link
              key={item.path}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all font-medium ${
                isActive
                  ? "bg-[#ff385c]/8 text-rausch"
                  : "text-secondary hover:text-nearblack hover:bg-surface"
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className="bg-rausch text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  aria-label={`미확인 알림 ${unreadCount}건`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 하단 로그아웃 */}
      <div className="p-3 border-t border-border-light">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-secondary hover:text-rausch hover:bg-[#ff385c]/8 transition-all"
          >
            <span className="text-base flex-shrink-0">🚪</span>
            <span>로그아웃</span>
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* ── 데스크톱 사이드바 ── */}
      <div className="hidden md:flex w-56 bg-white border-r border-border-light flex-col h-full flex-shrink-0">
        <SidebarContent />
      </div>

      {/* ── 모바일 상단 바 ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-border-light h-14 px-4 flex items-center gap-2">
        <Link href="/clients" className="p-1.5 text-secondary hover:text-nearblack flex-shrink-0">
          <span className="text-sm">←</span>
        </Link>
        <span className="text-base flex-shrink-0">🦞</span>
        <span className="text-sm font-bold text-nearblack truncate">{clientName}</span>
      </div>

      {/* ── 모바일 하단 탭 바 ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border-light flex items-stretch">
        {PRIMARY_TABS.map((item) => {
          const href = `/clients/${clientId}/${item.path}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          const showBadge = item.path === "history" && unreadCount > 0;

          return (
            <Link
              key={item.path}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative ${
                isActive ? "text-rausch" : "text-secondary"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {showBadge && (
                <span className="absolute top-1.5 right-1/4 bg-rausch text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* 더보기 탭 */}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
            moreOpen ? "text-rausch" : "text-secondary"
          }`}
        >
          <span className="text-lg leading-none">···</span>
          <span>더보기</span>
        </button>
      </div>

      {/* ── 모바일 더보기 드로어 ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          {/* 배경 오버레이 */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* 바텀 시트 */}
          <div className="relative w-full bg-white rounded-t-2xl shadow-xl flex flex-col">
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-border-light rounded-full" />
            </div>
            <div className="px-4 pb-2 pt-1">
              <p className="text-xs font-semibold text-secondary">더보기</p>
            </div>
            <nav className="px-3 pb-2 space-y-0.5">
              {SECONDARY_ITEMS.map((item) => {
                const href = `/clients/${clientId}/${item.path}`;
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={item.path}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all font-medium ${
                      isActive
                        ? "bg-[#ff385c]/8 text-rausch"
                        : "text-secondary hover:text-nearblack hover:bg-surface"
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-4 border-t border-border-light mt-1 pt-3">
              <Link
                href="/clients"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-secondary hover:text-nearblack hover:bg-surface transition-all"
              >
                <span className="text-base flex-shrink-0">←</span>
                <span>전체 목록</span>
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-secondary hover:text-rausch hover:bg-[#ff385c]/8 transition-all"
                >
                  <span className="text-base flex-shrink-0">🚪</span>
                  <span>로그아웃</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
