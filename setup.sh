#!/bin/bash

# ╔═══════════════════════════════════════════╗
# ║      NOVA-MD  —  VPS Auto Setup           ║
# ║   config.env කියවලා හදනවා               ║
# ╚═══════════════════════════════════════════╝

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$HOME/nova-md"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        🤖  NOVA-MD  SETUP  v1.0          ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── config.env check ─────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/config.env" ]; then
    err "config.env නැහැ! Files folder එකේ config.env දාන්න."
fi

log "config.env found — reading settings..."

parse_env() {
    grep "^${1}=" "$SCRIPT_DIR/config.env" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

SESSION_ID=$(parse_env SESSION_ID)
PHONE_NUMBER=$(parse_env PHONE_NUMBER)
OWNER_NAME=$(parse_env OWNER_NAME)
BOT_NAME=$(parse_env BOT_NAME)
PORT=$(parse_env PORT)
PORT=${PORT:-3001}

if [ -z "$SESSION_ID" ]; then
    err "config.env එකේ SESSION_ID හිස්! දාල ආයෙ run කරන්න."
fi

log "Bot   : ${BOT_NAME:-NOVA-MD}"
log "Owner : ${OWNER_NAME:-Owner}"
log "Phone : $PHONE_NUMBER"
log "Port  : $PORT"
log "Session: ${SESSION_ID:0:12}..."

# ── 1. System packages ────────────────────────────────────────────────────────
info "System packages check..."
sudo apt-get update -qq
sudo apt-get install -y curl git wget ffmpeg python3 build-essential -qq
log "System packages OK"

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────
NODE_VER=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
if [ "$NODE_VER" -lt 20 ] 2>/dev/null; then
    info "Node.js 20 install කරනවා..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
    sudo apt-get install -y nodejs -qq
fi
log "Node.js $(node -v)"

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "PM2 install කරනවා..."
    sudo npm install -g pm2 -q
fi
log "PM2 $(pm2 -v)"

# ── 4. Bot folder ─────────────────────────────────────────────────────────────
if [ -d "$BOT_DIR" ] && [ "$BOT_DIR" != "$SCRIPT_DIR" ]; then
    warn "Existing nova-md folder backup..."
    mv "$BOT_DIR" "${BOT_DIR}_bak_$(date +%s)"
fi
mkdir -p "$BOT_DIR"/{lib,plugins,auth_info,tmp}
log "Folders created"

# ── 5. Files copy ─────────────────────────────────────────────────────────────
info "Files copy කරනවා..."
for f in index.js config.js config.env package.json; do
    [ -f "$SCRIPT_DIR/$f" ] && cp "$SCRIPT_DIR/$f" "$BOT_DIR/$f" && log "  $f"
done
for f in commands.js functions.js database.js errorHandler.js; do
    [ -f "$SCRIPT_DIR/lib/$f" ] && cp "$SCRIPT_DIR/lib/$f" "$BOT_DIR/lib/$f" && log "  lib/$f"
done
for f in ping.js menu.js; do
    [ -f "$SCRIPT_DIR/plugins/$f" ] && cp "$SCRIPT_DIR/plugins/$f" "$BOT_DIR/plugins/$f" && log "  plugins/$f"
done
touch "$BOT_DIR/auth_info/.gitkeep"

# ── 6. npm install ────────────────────────────────────────────────────────────
info "npm packages install කරනවා..."
cd "$BOT_DIR"
npm install --omit=dev --silent
log "npm packages done"

# ── 7. PM2 start ─────────────────────────────────────────────────────────────
info "Bot start කරනවා..."
pm2 delete nova-md 2>/dev/null || true
pm2 start index.js \
    --name "nova-md" \
    --restart-delay=5000 \
    --max-restarts=10 \
    --time
pm2 save
pm2 startup 2>/dev/null | grep "sudo env" | bash 2>/dev/null || true
log "PM2 started"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          ✅  SETUP COMPLETE!              ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  📁 Bot    : ${CYAN}$BOT_DIR${NC}"
echo -e "  📋 Status : ${CYAN}pm2 status${NC}"
echo -e "  📜 Logs   : ${CYAN}pm2 logs nova-md${NC}"
echo -e "  🔄 Update : ${CYAN}bash update.sh${NC}"
echo ""
echo -e "${YELLOW}  💡 Pairing code terminal එකේ show වෙනවා${NC}"
echo ""
