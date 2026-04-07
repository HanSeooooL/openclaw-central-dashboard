"use client";

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
  { label: "게이트웨이", icon: "🌐", path: "gateway" },
  { label: "비용", icon: "💰", path: "costs" },
  { label: "알림", icon: "🔔", path: "alerts" },
  { label: "로그", icon: "📋", path: "logs" },
  { label: "모델", icon: "🤖", path: "models" },
];

interface ClientSidebarProps {
  clientId: string;
  clientName: string;
}

export default function ClientSidebar({ clientId, clientName }: ClientSidebarProps) {
  const pathname = usePathname();
  const unreadCount = useAlertStore((s) => s.alerts.filter((a) => a.client_id === clientId && !a.read).length);

  return (
    <div className="w-56 bg-white border-r border-border-light flex flex-col h-full">
      {/* 로고 영역 */}
      <div className="p-4 border-b border-border-light">
        <Link href="/clients" className="flex items-center gap-1.5 text-secondary hover:text-nearblack transition-colors mb-3 text-xs font-medium">
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
          const showBadge = item.path === "alerts" && unreadCount > 0;

          return (
            <Link
              key={item.path}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all font-medium ${
                isActive
                  ? "bg-[#ff385c]/8 text-rausch"
                  : "text-secondary hover:text-nearblack hover:bg-surface"
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="bg-rausch text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
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
    </div>
  );
}
