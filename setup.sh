#!/bin/bash

# ╔═══════════════════════════════════════════╗
# ║      NOVA-MD  —  VPS Auto Setup           ║
# ║   bash setup.sh කියන එකෙන් හැදෙනවා       ║
# ╚═══════════════════════════════════════════╝

set -e  # error එකක් ආවොත් stop කරනවා

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        🤖  NOVA-MD  SETUP  v1.0          ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. System update ──────────────────────────────────────────────────────────
info "System update කරනවා..."
sudo apt-get update -qq
sudo apt-get install -y curl git wget ffmpeg python3 build-essential -qq
log "System packages installed"

# ── 2. Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
    info "Node.js 20 install කරනවා..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
    sudo apt-get install -y nodejs -qq
    log "Node.js $(node -v) installed"
else
    log "Node.js $(node -v) already installed"
fi

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "PM2 install කරනවා..."
    sudo npm install -g pm2 -q
    log "PM2 installed"
else
    log "PM2 already installed"
fi

# ── 4. Bot folder ─────────────────────────────────────────────────────────────
BOT_DIR="$HOME/nova-md"

if [ -d "$BOT_DIR" ]; then
    warn "nova-md folder දැනටමත් තියනවා. Backup කරනවා..."
    mv "$BOT_DIR" "${BOT_DIR}_backup_$(date +%s)"
fi

info "Bot folder හදනවා..."
mkdir -p "$BOT_DIR"/{lib,plugins,auth_info,tmp}
log "Folders created: $BOT_DIR"

# ── 5. Files copy කරනවා ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "Files copy කරනවා..."

FILES=(
    "index.js"
    "config.js"
    "config.env"
    "package.json"
    "lib/commands.js"
    "lib/functions.js"
    "lib/database.js"
    "lib/errorHandler.js"
    "plugins/ping.js"
    "plugins/menu.js"
)

for f in "${FILES[@]}"; do
    src="$SCRIPT_DIR/$f"
    dst="$BOT_DIR/$f"
    if [ -f "$src" ]; then
        cp "$src" "$dst"
        log "Copied: $f"
    else
        warn "Not found (skip): $f"
    fi
done

touch "$BOT_DIR/auth_info/.gitkeep"

# ── 6. npm install ────────────────────────────────────────────────────────────
info "npm packages install කරනවා... (මෙය මිනිත්තු කිහිපයක් ගත වෙයි)"
cd "$BOT_DIR"
npm install --omit=dev 2>&1 | tail -5
log "npm packages installed"

# ── 7. config.env configure කරනවා ────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  📝  CONFIG.ENV SETUP${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# SESSION_ID
echo -e -n "${CYAN}SESSION_ID${NC} (Mega file code හෝ NOVA~xxxx): "
read -r SESSION_ID_INPUT
if [ -n "$SESSION_ID_INPUT" ]; then
    sed -i "s|SESSION_ID=.*|SESSION_ID=$SESSION_ID_INPUT|" "$BOT_DIR/config.env"
    log "SESSION_ID set"
fi

# PHONE_NUMBER
echo -e -n "${CYAN}PHONE_NUMBER${NC} (94xxxxxxxxx format): "
read -r PHONE_INPUT
if [ -n "$PHONE_INPUT" ]; then
    sed -i "s|PHONE_NUMBER=.*|PHONE_NUMBER=$PHONE_INPUT|" "$BOT_DIR/config.env"
    sed -i "s|OWNER_NUMBER=.*|OWNER_NUMBER=$PHONE_INPUT|" "$BOT_DIR/config.env"
    sed -i "s|SUDO=.*|SUDO=$PHONE_INPUT|" "$BOT_DIR/config.env"
    log "Phone numbers set"
fi

# OWNER_NAME
echo -e -n "${CYAN}OWNER_NAME${NC} (ඔබගේ නම): "
read -r OWNER_NAME_INPUT
if [ -n "$OWNER_NAME_INPUT" ]; then
    sed -i "s|OWNER_NAME=.*|OWNER_NAME=$OWNER_NAME_INPUT|" "$BOT_DIR/config.env"
    log "Owner name set"
fi

# BOT_NAME
echo -e -n "${CYAN}BOT_NAME${NC} (default: NOVA-MD): "
read -r BOT_NAME_INPUT
if [ -n "$BOT_NAME_INPUT" ]; then
    sed -i "s|BOT_NAME=.*|BOT_NAME=$BOT_NAME_INPUT|" "$BOT_DIR/config.env"
    log "Bot name set"
fi

# MONGODB
echo -e -n "${CYAN}MONGODB${NC} URL (optional, enter skip කරන්න): "
read -r MONGO_INPUT
if [ -n "$MONGO_INPUT" ]; then
    sed -i "s|MONGODB=.*|MONGODB=$MONGO_INPUT|" "$BOT_DIR/config.env"
    log "MongoDB URL set"
fi

# ── 8. PM2 start ─────────────────────────────────────────────────────────────
echo ""
info "PM2 නල bot start කරනවා..."
cd "$BOT_DIR"

pm2 delete nova-md 2>/dev/null || true
pm2 start index.js --name "nova-md" \
    --restart-delay=5000 \
    --max-restarts=10 \
    --log "$HOME/.pm2/logs/nova-md.log" \
    --time

pm2 save
pm2 startup | grep "sudo" | bash 2>/dev/null || true

log "PM2 started — bot is running!"

# ── 9. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          ✅  SETUP COMPLETE!              ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  📁 Bot folder  : ${CYAN}$BOT_DIR${NC}"
echo -e "  📋 PM2 status  : ${CYAN}pm2 status${NC}"
echo -e "  📜 Logs        : ${CYAN}pm2 logs nova-md${NC}"
echo -e "  🔄 Restart     : ${CYAN}pm2 restart nova-md${NC}"
echo -e "  ⛔ Stop        : ${CYAN}pm2 stop nova-md${NC}"
echo -e "  ✏️  Edit config : ${CYAN}nano $BOT_DIR/config.env${NC}"
echo ""
echo -e "${YELLOW}  💡 Session pairing code terminal එකේ දිස්වෙනවා${NC}"
echo -e "${YELLOW}     WhatsApp > Linked Devices > Link a Device > Enter code${NC}"
echo ""
