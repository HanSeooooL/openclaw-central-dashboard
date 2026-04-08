#!/bin/bash
# OpenClaw Reporter 설치 스크립트
# Node.js 22+ 필요 (openclaw 자체 요구사항과 동일)
# 사용법: curl -fsSL <URL>/install.sh | bash -s -- --token <TOKEN> --client-id <UUID>
#
# Gateway 토큰은 ~/.openclaw/openclaw.json에서 자동 감지됩니다.
# WebSocket 이벤트 기반 모드로 동작하며, 실패 시 폴링 모드로 자동 전환됩니다.

set -e

SUPABASE_URL="https://ytagjuslvkyhatsvppob.supabase.co"
REPORTER_TOKEN=""
CLIENT_ID=""
GATEWAY_HOST="localhost"
GATEWAY_PORT=18789
GATEWAY_TOKEN=""
INSTALL_DIR="$HOME/.openclaw-reporter"
REPORTER_URL="https://raw.githubusercontent.com/HanSeooooL/openclaw-central-dashboard/main/reporter/reporter.mjs"

# ── 인자 파싱 ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --token)         REPORTER_TOKEN="$2"; shift 2 ;;
    --client-id)     CLIENT_ID="$2";      shift 2 ;;
    --gateway-host)  GATEWAY_HOST="$2";   shift 2 ;;
    --gateway-port)  GATEWAY_PORT="$2";   shift 2 ;;
    --gateway-token) GATEWAY_TOKEN="$2";  shift 2 ;;
    *) echo "알 수 없는 옵션: $1"; exit 1 ;;
  esac
done

if [ -z "$REPORTER_TOKEN" ] || [ -z "$CLIENT_ID" ]; then
  echo "오류: --token 과 --client-id 가 필요합니다."
  echo "사용법: curl -fsSL <URL>/install.sh | bash -s -- --token <TOKEN> --client-id <UUID>"
  echo "  옵션: --gateway-host <HOST>   (기본값: localhost — 컨테이너 sidecar는 host.docker.internal 등)"
  echo "        --gateway-port <PORT>   (기본값: 18789)"
  echo "        --gateway-token <TOKEN>  (기본값: ~/.openclaw/openclaw.json 자동 감지)"
  exit 1
fi

# ── 사전 조건 확인 ─────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js 22+ 이 필요합니다. https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js 22+ 이 필요합니다. 현재: $(node -v)"
  exit 1
fi

NODE_BIN="$(which node)"
OS="$(uname -s)"

# openclaw CLI 절대 경로 확정 (PATH 의존성 제거)
# 1) 사용자 PATH에서 탐색 → 2) 잘 알려진 위치 → 3) Homebrew Cellar glob
OPENCLAW_BIN="$(command -v openclaw 2>/dev/null || true)"
if [ -z "$OPENCLAW_BIN" ]; then
  for cand in \
    "$HOME/.openclaw/bin/openclaw" \
    "$HOME/.local/bin/openclaw" \
    "$HOME/.cargo/bin/openclaw" \
    "/opt/homebrew/bin/openclaw" \
    "/usr/local/bin/openclaw"; do
    if [ -x "$cand" ]; then OPENCLAW_BIN="$cand"; break; fi
  done
fi
if [ -z "$OPENCLAW_BIN" ]; then
  for cand in /opt/homebrew/Cellar/node/*/bin/openclaw /usr/local/Cellar/node/*/bin/openclaw; do
    [ -x "$cand" ] && OPENCLAW_BIN="$cand" && break
  done
fi
if [ -z "$OPENCLAW_BIN" ]; then
  echo "❌ openclaw CLI를 찾을 수 없습니다. 먼저 openclaw를 설치하세요."
  exit 1
fi
# 심볼릭이면 실체 경로로 (Cellar 버전 업글로 깨지지 않게 ‘있는 그대로’ 저장)
echo "▸ openclaw CLI: $OPENCLAW_BIN"

echo "=== OpenClaw Reporter 설치 ==="
echo ""

# ── reporter.mjs 다운로드 ──────────────────────────────
mkdir -p "$INSTALL_DIR"
echo "▸ reporter.mjs 다운로드 중..."
curl -fsSL "$REPORTER_URL" -o "$INSTALL_DIR/reporter.mjs"
echo "  → $INSTALL_DIR/reporter.mjs"

# ── config.json 생성 (python3 우선, fallback heredoc) ──
if command -v python3 &>/dev/null; then
  SUPABASE_URL="$SUPABASE_URL" \
  REPORTER_TOKEN="$REPORTER_TOKEN" \
  CLIENT_ID="$CLIENT_ID" \
  OPENCLAW_BIN="$OPENCLAW_BIN" \
  GATEWAY_HOST="$GATEWAY_HOST" \
  GATEWAY_PORT="$GATEWAY_PORT" \
  GATEWAY_TOKEN="$GATEWAY_TOKEN" \
  python3 - > "$INSTALL_DIR/config.json" <<'PY'
import json, os, sys
cfg = {
  "supabase_url": os.environ["SUPABASE_URL"],
  "reporter_token": os.environ["REPORTER_TOKEN"],
  "client_id": os.environ["CLIENT_ID"],
  "openclaw_bin": os.environ["OPENCLAW_BIN"],
  "gateway_host": os.environ["GATEWAY_HOST"],
  "gateway_port": int(os.environ["GATEWAY_PORT"]),
  "gateway_token": os.environ["GATEWAY_TOKEN"] or None,
  "health_check_interval_ms": 30000,
  "full_scan_interval_ms": 300000,
  "command_poll_interval_ms": 30000,
}
json.dump(cfg, sys.stdout, indent=2)
PY
else
  GATEWAY_TOKEN_JSON="null"
  [ -n "$GATEWAY_TOKEN" ] && GATEWAY_TOKEN_JSON="\"$GATEWAY_TOKEN\""
  cat > "$INSTALL_DIR/config.json" <<EOF
{
  "supabase_url": "$SUPABASE_URL",
  "reporter_token": "$REPORTER_TOKEN",
  "client_id": "$CLIENT_ID",
  "openclaw_bin": "$OPENCLAW_BIN",
  "gateway_host": "$GATEWAY_HOST",
  "gateway_port": $GATEWAY_PORT,
  "gateway_token": $GATEWAY_TOKEN_JSON,
  "health_check_interval_ms": 30000,
  "full_scan_interval_ms": 300000,
  "command_poll_interval_ms": 30000
}
EOF
fi
# 참고: gateway_token이 null이면 ~/.openclaw/openclaw.json에서 자동 감지
# WebSocket 연결 성공 시 이벤트 기반 모드로 동작, 실패 시 폴링 모드 사용
# health_check_interval_ms / full_scan_interval_ms 는 폴링 fallback 설정값
echo "  → $INSTALL_DIR/config.json"

# ── 서비스 등록 ────────────────────────────────────────
if [ "$OS" = "Linux" ] && command -v systemctl &>/dev/null; then
  # ── systemd (Linux) ──
  echo "▸ systemd 서비스 등록 중..."
  SERVICE_FILE="/etc/systemd/system/openclaw-reporter.service"
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=OpenClaw Reporter Agent
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$NODE_BIN $INSTALL_DIR/reporter.mjs
Restart=always
RestartSec=10
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable openclaw-reporter
  sudo systemctl restart openclaw-reporter

  echo "  → systemd 서비스 등록 완료"
  echo ""
  echo "✅ 설치 완료!"
  echo ""
  echo "  상태 확인: sudo systemctl status openclaw-reporter"
  echo "  로그 확인: sudo journalctl -u openclaw-reporter -f"
  echo ""
  echo "  동작 모드: ~/.openclaw/openclaw.json 감지 시 WebSocket 이벤트 기반"
  echo "             미감지 시 폴링 모드 (헬스체크 30s, 풀스캔 5min)"

elif [ "$OS" = "Darwin" ]; then
  # ── launchd (macOS) ──
  echo "▸ launchd 서비스 등록 중..."
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$PLIST_DIR/com.openclaw.reporter.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.reporter</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$INSTALL_DIR/reporter.mjs</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/reporter.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/reporter.error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>
EOF

  # 기존 서비스 언로드 후 재등록
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"

  echo "  → launchd 서비스 등록 완료"
  echo ""
  echo "✅ 설치 완료! (로그인 시 자동 시작, 재시작 시 자동 복구)"
  echo ""
  echo "  상태 확인: launchctl list | grep openclaw"
  echo "  로그 확인: tail -f $INSTALL_DIR/reporter.log"
  echo ""
  echo "  동작 모드: ~/.openclaw/openclaw.json 감지 시 WebSocket 이벤트 기반"
  echo "             미감지 시 폴링 모드 (헬스체크 30s, 풀스캔 5min)"

else
  # ── fallback: PID 파일 + cron 데몬화 (systemd 없는 Linux/Alpine/Docker) ──
  echo "▸ systemd/launchd 없음 → PID + cron 데몬화 모드"

  PID_FILE="$INSTALL_DIR/reporter.pid"
  RUN_SCRIPT="$INSTALL_DIR/run.sh"

  cat > "$RUN_SCRIPT" <<RUNEOF
#!/bin/sh
# openclaw-reporter supervisor — cron으로 매분 호출되어 죽어있으면 살림
PID_FILE="$PID_FILE"
LOG_FILE="$INSTALL_DIR/reporter.log"
NODE_BIN="$NODE_BIN"
REPORTER="$INSTALL_DIR/reporter.mjs"

if [ -f "\$PID_FILE" ] && kill -0 "\$(cat "\$PID_FILE" 2>/dev/null)" 2>/dev/null; then
  exit 0   # 이미 살아있음
fi

nohup "\$NODE_BIN" "\$REPORTER" >> "\$LOG_FILE" 2>&1 &
echo \$! > "\$PID_FILE"
RUNEOF
  chmod +x "$RUN_SCRIPT"
  echo "  → $RUN_SCRIPT 생성"

  # cron 등록 시도: system cron → user crontab → 안내
  CRON_ENTRY="* * * * * $RUN_SCRIPT >/dev/null 2>&1"
  CRON_REBOOT="@reboot $RUN_SCRIPT >/dev/null 2>&1"
  CRON_REGISTERED="no"

  if [ -d /etc/cron.d ] && [ -w /etc/cron.d 2>/dev/null ] || sudo -n true 2>/dev/null; then
    if sudo -n test -w /etc/cron.d 2>/dev/null || [ -w /etc/cron.d ]; then
      sudo tee /etc/cron.d/openclaw-reporter >/dev/null <<CRONEOF
# openclaw-reporter supervisor
$CRON_REBOOT
$CRON_ENTRY
CRONEOF
      echo "  → /etc/cron.d/openclaw-reporter 등록 완료 (매분 supervisor + @reboot)"
      CRON_REGISTERED="yes"
    fi
  fi

  if [ "$CRON_REGISTERED" = "no" ] && command -v crontab &>/dev/null; then
    EXISTING="$(crontab -l 2>/dev/null || true)"
    if echo "$EXISTING" | grep -qF "$RUN_SCRIPT"; then
      echo "  → user crontab에 이미 등록됨"
    else
      ( echo "$EXISTING"; echo "$CRON_REBOOT"; echo "$CRON_ENTRY" ) | crontab -
      echo "  → user crontab 등록 완료 (매분 supervisor + @reboot)"
    fi
    CRON_REGISTERED="yes"
  fi

  if [ "$CRON_REGISTERED" = "no" ]; then
    echo ""
    echo "  ⚠️  cron이 없습니다. 컨테이너/미니멀 환경으로 보입니다."
    echo "     컨테이너 entrypoint나 supervisord에 다음을 등록하세요:"
    echo "       $RUN_SCRIPT"
    echo "     또는 foreground 실행:"
    echo "       $NODE_BIN $INSTALL_DIR/reporter.mjs"
  fi

  # 즉시 1회 시작
  "$RUN_SCRIPT"
  sleep 2
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "  → reporter 시작됨 (PID: $(cat "$PID_FILE"))"
  fi

  echo ""
  echo "✅ 설치 완료!"
  echo ""
  echo "  상태: pgrep -F $PID_FILE && echo alive"
  echo "  로그: tail -f $INSTALL_DIR/reporter.log"
  echo "  중지: kill \$(cat $PID_FILE)"
  echo ""
  echo "  동작 모드: ~/.openclaw/openclaw.json 감지 시 WebSocket 이벤트 기반"
  echo "             미감지 시 폴링 모드 (헬스체크 30s, 풀스캔 5min)"
fi
echo ""
