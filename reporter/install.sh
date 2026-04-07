#!/bin/bash
# OpenClaw Reporter 설치 스크립트
# 사용법: curl -fsSL <URL>/install.sh | bash -s -- --token <TOKEN> --client-id <UUID>

set -e

SUPABASE_URL="https://ytagjuslvkyhatsvppob.supabase.co"
REPORTER_TOKEN=""
CLIENT_ID=""
GATEWAY_PORT=18789
INSTALL_DIR="$HOME/.openclaw-reporter"
REPORTER_URL="https://raw.githubusercontent.com/HanSeooooL/openclaw-central-dashboard/main/reporter/reporter.mjs"

# ── 인자 파싱 ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --token)        REPORTER_TOKEN="$2"; shift 2 ;;
    --client-id)    CLIENT_ID="$2";      shift 2 ;;
    --gateway-port) GATEWAY_PORT="$2";   shift 2 ;;
    *) echo "알 수 없는 옵션: $1"; exit 1 ;;
  esac
done

if [ -z "$REPORTER_TOKEN" ] || [ -z "$CLIENT_ID" ]; then
  echo "오류: --token 과 --client-id 가 필요합니다."
  echo "사용법: curl -fsSL <URL>/install.sh | bash -s -- --token <TOKEN> --client-id <UUID>"
  exit 1
fi

# ── 사전 조건 확인 ─────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js 18+ 이 필요합니다. https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node.js 18+ 이 필요합니다. 현재: $(node -v)"
  exit 1
fi

echo "=== OpenClaw Reporter 설치 ==="
echo ""

# ── reporter.mjs 다운로드 ──────────────────────────────
mkdir -p "$INSTALL_DIR"
echo "▸ reporter.mjs 다운로드 중..."
curl -fsSL "$REPORTER_URL" -o "$INSTALL_DIR/reporter.mjs"
echo "  → $INSTALL_DIR/reporter.mjs"

# ── config.json 생성 ──────────────────────────────────
cat > "$INSTALL_DIR/config.json" <<EOF
{
  "supabase_url": "$SUPABASE_URL",
  "reporter_token": "$REPORTER_TOKEN",
  "client_id": "$CLIENT_ID",
  "gateway_port": $GATEWAY_PORT,
  "health_check_interval_ms": 30000,
  "full_scan_interval_ms": 300000,
  "command_poll_interval_ms": 30000
}
EOF
echo "  → $INSTALL_DIR/config.json"

# ── openclaw start 래퍼 함수 ──────────────────────────
WRAPPER_MARKER="# >>> openclaw-reporter auto-start <<<"
WRAPPER_FUNC="$WRAPPER_MARKER
openclaw() {
  command openclaw \"\$@\"
  if [ \"\$1\" = \"start\" ]; then
    nohup node \"\$HOME/.openclaw-reporter/reporter.mjs\" \
      >> \"\$HOME/.openclaw-reporter/reporter.log\" 2>&1 &
    disown
    echo \"[Reporter] 시작됨 (PID: \$!)\"
  fi
}
# <<< openclaw-reporter auto-start >>>"

# 적용할 RC 파일 결정
if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
  RC_FILE="$HOME/.zshrc"
else
  RC_FILE="$HOME/.bashrc"
fi

echo "▸ shell 래퍼 등록 중... ($RC_FILE)"
if grep -q "openclaw-reporter auto-start" "$RC_FILE" 2>/dev/null; then
  echo "  → 이미 등록되어 있습니다. 스킵."
else
  echo "" >> "$RC_FILE"
  echo "$WRAPPER_FUNC" >> "$RC_FILE"
  echo "  → $RC_FILE 에 추가 완료"
fi

# ── 완료 ──────────────────────────────────────────────
echo ""
echo "✅ 설치 완료!"
echo ""
echo "  적용: source $RC_FILE"
echo "  실행: openclaw start"
echo "  로그: tail -f $INSTALL_DIR/reporter.log"
echo ""
