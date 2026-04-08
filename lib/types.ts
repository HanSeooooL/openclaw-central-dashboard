// ─────────────────────────────────────────
// openclaw-console-kr의 타입 정의를 그대로 복사
// ─────────────────────────────────────────

export interface ChannelStatus {
  name: string;
  status: string;
  bot_name: string;
  latency_ms: number | null;
}

export interface SessionInfo {
  key: string;
  kind: string;
  agent_id: string;
  session_id: string;
  age_display: string;
  age_ms: number;
  total_tokens: number;
  percent_used: number;
  model: string;
  context_tokens: number;
}

export interface AgentInfo {
  id: string;
  sessions_count: number;
  last_active_age_ms: number;
  is_default: boolean;
}

export interface TaskSummary {
  total: number;
  active: number;
  running: number;
  succeeded: number;
  failed: number;
  timed_out: number;
}

export interface FailedTaskInfo {
  task_id: string | null;
  label: string | null;
  runtime: string | null;
  started_at: number | null;
  ended_at: number | null;
  error: string | null;
  terminal_summary: string | null;
}

export interface HeartbeatAgent {
  agent_id: string;
  enabled: boolean;
  interval: string;
}

export interface FullStatus {
  runtime_version: string;
  os_label: string;
  gateway_online: boolean;
  gateway_url: string;
  gateway_host: string;
  gateway_ip: string;
  gateway_latency_ms: number | null;
  gateway_pid: number | null;
  gateway_service_running: boolean;
  gateway_uptime: string;
  gateway_platform: string;
  channels: ChannelStatus[];
  default_agent_id: string;
  agents: AgentInfo[];
  session_count: number;
  default_model: string;
  default_context_tokens: number;
  sessions: SessionInfo[];
  tasks: TaskSummary;
  heartbeat_agents: HeartbeatAgent[];
  memory_plugin_enabled: boolean;
  memory_plugin_slot: string;
  memory_files_count: number;
  debug_bin: string;
  debug_status_error: string | null;
  debug_health_error: string | null;
  debug_gateway_error: string | null;
  /** Reporter 가 `openclaw tasks list --status failed` 로 수집한 최근 실패 태스크 상세 (최대 10개) */
  failed_tasks?: FailedTaskInfo[];
}

export interface SystemInfo {
  cpu_usage: number;
  memory_total: number;
  memory_used: number;
  memory_percent: number;
  disk_total: number;
  disk_used: number;
  disk_percent: number;
}

// ─────────────────────────────────────────
// 중앙 대시보드 전용 타입
// ─────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  notes: string | null;
  last_seen?: string | null;
}

export interface Snapshot {
  id: number;
  client_id: string;
  ts: string;
  gateway_online: boolean;
  gateway_latency_ms: number | null;
  session_count: number;
  total_tokens: number;
  total_cost_usd: number;
  tasks_running: number;
  tasks_failed: number;
  full_status: FullStatus | null;
  system_info: SystemInfo | null;
}

export interface AlertMetadata {
  debug_status_error?: string | null;
  debug_health_error?: string | null;
  debug_gateway_error?: string | null;
  gateway_latency_ms?: number | null;
  gateway_uptime?: string | null;
  cpu_usage?: number | null;
  memory_percent?: number | null;
  disk_percent?: number | null;
  channel_name?: string | null;
  tasks_failed_delta?: number | null;
  failed_tasks?: FailedTaskInfo[];
  [key: string]: unknown;
}

export interface ClientAlert {
  id: number;
  client_id: string;
  type: "gateway_offline" | "gateway_offline_first" | "task_failed" | "channel_down";
  message: string;
  ts: string;
  read: boolean;
  metadata: AlertMetadata | null;
}

export interface PendingCommand {
  id: number;
  client_id: string;
  command: "gateway_start" | "gateway_stop" | "gateway_restart";
  status: "pending" | "ack" | "done" | "error";
  result: string | null;
  issued_at: string;
  acked_at: string | null;
  done_at: string | null;
}

export type GatewayCommand = "gateway_start" | "gateway_stop" | "gateway_restart";
