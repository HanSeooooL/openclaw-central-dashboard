import type { FullStatus, SystemInfo } from "./types";

export const EMPTY_STATUS: FullStatus = {
  runtime_version: "...", os_label: "", gateway_online: false, gateway_url: "",
  gateway_host: "", gateway_ip: "", gateway_latency_ms: null, gateway_pid: null,
  gateway_service_running: false, gateway_uptime: "...", gateway_platform: "",
  channels: [], default_agent_id: "main", agents: [], session_count: 0,
  default_model: "unknown", default_context_tokens: 200000, sessions: [],
  tasks: { total: 0, active: 0, running: 0, succeeded: 0, failed: 0, timed_out: 0 },
  heartbeat_agents: [], memory_plugin_enabled: false, memory_plugin_slot: "",
  memory_files_count: 0, debug_bin: "", debug_status_error: null,
  debug_health_error: null, debug_gateway_error: null,
};

export const EMPTY_SYSTEM: SystemInfo = {
  cpu_usage: 0, memory_total: 0, memory_used: 0, memory_percent: 0,
  disk_total: 0, disk_used: 0, disk_percent: 0,
};
