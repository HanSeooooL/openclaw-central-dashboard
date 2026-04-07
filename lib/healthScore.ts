import type { FullStatus, SystemInfo, ChannelStatus, Snapshot } from "./types";

export type Level = "good" | "warning" | "critical";

export interface ServerStatus {
  grade: Level;
  title: string;
  subtitle: string;
}

export interface MonthlyCost {
  usd: number;
  sessionCount: number;
  hasData: boolean;
}

export interface RecentErrors {
  count: number;
  level: Level;
}

export interface SystemLoad {
  percent: number;
  level: Level;
  label: string;
  detail: string;
}

export interface ContextSaturation {
  saturated: number;
  total: number;
  level: Level;
}

export function hoursElapsedSinceMonthStart(): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return Math.ceil((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60));
}

export function computeServerStatus(status: FullStatus): ServerStatus {
  if (!status.gateway_online) {
    return { grade: "critical", title: "서비스 중단", subtitle: "게이트웨이 오프라인" };
  }
  const lat = status.gateway_latency_ms;
  const channels = status.channels;
  const onlineCh = channels.filter((c: ChannelStatus) => c.status === "online").length;
  const totalCh = channels.length;
  const allChannelsOk = totalCh === 0 || onlineCh === totalCh;
  const latencyOk = lat == null || lat < 500;

  if (latencyOk && allChannelsOk) {
    const latStr = lat != null ? `응답 ${lat}ms` : "응답 양호";
    const chStr = totalCh > 0 ? `채널 ${onlineCh}/${totalCh} 정상` : "채널 없음";
    return { grade: "good", title: "정상 운영", subtitle: `${chStr} · ${latStr}` };
  }

  const issues: string[] = [];
  if (!latencyOk && lat != null) issues.push(`응답 ${lat}ms`);
  if (!allChannelsOk) issues.push(`채널 ${onlineCh}/${totalCh}`);
  return { grade: "warning", title: "불안정", subtitle: issues.join(" · ") };
}

export function computeMonthlyCost(snapshots: Snapshot[]): MonthlyCost {
  if (snapshots.length === 0) return { usd: 0, sessionCount: 0, hasData: false };
  const last = snapshots[snapshots.length - 1];
  return { usd: last.total_cost_usd, sessionCount: last.session_count, hasData: true };
}

export function computeRecentErrors(snapshots: Snapshot[]): RecentErrors {
  if (snapshots.length < 2) return { count: 0, level: "good" };
  let accumulated = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const delta = snapshots[i].tasks_failed - snapshots[i - 1].tasks_failed;
    if (delta > 0) accumulated += delta;
  }
  const level: Level = accumulated === 0 ? "good" : accumulated < 5 ? "warning" : "critical";
  return { count: accumulated, level };
}

export function computeContextSaturation(status: FullStatus): ContextSaturation {
  const sessions = status.sessions;
  const saturated = sessions.filter((s) => s.percent_used >= 80).length;
  const total = sessions.length;
  const level: Level = saturated === 0 ? "good" : saturated <= 2 ? "warning" : "critical";
  return { saturated, total, level };
}

export function computeSystemLoad(systemInfo: SystemInfo): SystemLoad {
  const percent = Math.round(systemInfo.cpu_usage * 0.4 + systemInfo.memory_percent * 0.6);
  const level: Level = percent < 60 ? "good" : percent < 80 ? "warning" : "critical";
  const label = level === "good" ? "여유 있음" : level === "warning" ? "사용 중" : "과부하";
  const detail = `CPU ${Math.round(systemInfo.cpu_usage)}% · 메모리 ${Math.round(systemInfo.memory_percent)}%`;
  return { percent, level, label, detail };
}
