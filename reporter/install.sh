#!/bin/bash
# OpenClaw Reporter 설치 스크립트
# 사용법: ./install.sh
# 사전 조건: Node.js 18+, openclaw 설치됨

set -e

REPORTER_DIR="$HOME/.openclaw-reporter"
CONFIG_FILE="$REPORTER_DIR/config.json"
REPORTER_SCRIPT="$(dirname "$(realpath "$0")")/reporter.mjs"

echo "=== OpenClaw Reporter 설치 ==="

# 디렉토리 생성
mkdir -p "$REPORTER_DIR"

# config.json 없으면 example에서 복사
if [ ! -f "$CONFIG_FILE" ]; then
  cp "$(dirname "$0")/config.example.json" "$CONFIG_FILE"
  echo ""
  echo "⚠️  설정 파일이 생성되었습니다: $CONFIG_FILE"
  echo "   아래 항목을 채워주세요:"
  echo "   - supabase_url"
  echo "   - reporter_token (대시보드에서 발급)"
  echo "   - client_id (대시보드에서 확인)"
  echo ""
  echo "설정 완료 후 이 스크립트를 다시 실행하세요."
  exit 0
fi

# node 버전 확인
NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "fail")
if [ "$NODE_VERSION" = "fail" ]; then
  echo "❌ Node.js 18+ 이 필요합니다."
  exit 1
fi

echo "✅ Node.js 버전 확인 완료"

# OS 감지
OS="$(uname -s)"

if [ "$OS" = "Linux" ]; then
  # systemd 서비스 설치
  SERVICE_FILE="/etc/systemd/system/openclaw-reporter.service"
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=OpenClaw Reporter Agent
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$(which node) $REPORTER_SCRIPT
Restart=always
RestartSec=10
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable openclaw-reporter
  sudo systemctl start openclaw-reporter

  echo ""
  echo "✅ systemd 서비스로 설치 완료"
  echo "   상태 확인: sudo systemctl status openclaw-reporter"
  echo "   로그 확인: sudo journalctl -u openclaw-reporter -f"

elif [ "$OS" = "Darwin" ]; then
  # launchd plist 설치 (macOS)
  PLIST_PATH="$HOME/Library/LaunchAgents/com.openclaw.reporter.plist"
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.reporter</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>$REPORTER_SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$REPORTER_DIR/reporter.log</string>
  <key>StandardErrorPath</key>
  <string>$REPORTER_DIR/reporter.error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
</dict>
</plist>
EOF

  launchctl load "$PLIST_PATH"

  echo ""
  echo "✅ launchd 서비스로 설치 완료"
  echo "   상태 확인: launchctl list | grep openclaw"
  echo "   로그 확인: tail -f $REPORTER_DIR/reporter.log"

else
  echo "⚠️  수동 실행: node $REPORTER_SCRIPT"
fi

echo ""
echo "=== 설치 완료 ==="
