#!/bin/bash

# ╔═══════════════════════════════════════════════════╗
# ║        APEX-MD V2 - VPS Auto Setup Script        ║
# ║          Created by: Shehan Vimukthi             ║
# ╚═══════════════════════════════════════════════════╝

set -e  # Error එකක් ආවොත් stop කරන්න

# ==================== COLORS ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# ==================== BANNER ====================
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${WHITE}        APEX-MD V2 - VPS Auto Setup               ${CYAN}║${NC}"
echo -e "${CYAN}║${WHITE}          Created by: Shehan Vimukthi             ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# ==================== HELPER FUNCTIONS ====================
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()    { echo -e "\n${WHITE}━━━ $1 ━━━${NC}"; }

# ==================== ROOT CHECK ====================
if [ "$EUID" -ne 0 ]; then
    warn "Root නෙවෙයි. Sudo required commands වලට sudo use කරයි."
    SUDO_CMD="sudo"
else
    SUDO_CMD=""
fi

# ==================== STEP 1: SYSTEM UPDATE ====================
step "Step 1: System Update"
info "Package list update කරනවා..."
$SUDO_CMD apt-get update -qq
success "System updated"

# ==================== STEP 2: NODE.JS CHECK/INSTALL ====================
step "Step 2: Node.js 20+ Check"

NODE_OK=false
if command -v node &>/dev/null; then
    NODE_VER=$(node -v | grep -oP '\d+' | head -1)
    if [ "$NODE_VER" -ge 20 ]; then
        success "Node.js $(node -v) already installed"
        NODE_OK=true
    else
        warn "Node.js $(node -v) too old. Installing v20..."
    fi
fi

if [ "$NODE_OK" = false ]; then
    info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO_CMD -E bash -
    $SUDO_CMD apt-get install -y nodejs
    success "Node.js $(node -v) installed"
fi

# ==================== STEP 3: NPM CHECK ====================
step "Step 3: npm Check"
NPM_VER=$(npm -v | grep -oP '\d+' | head -1)
if [ "$NPM_VER" -lt 10 ]; then
    info "npm update කරනවා..."
    $SUDO_CMD npm install -g npm@latest
fi
success "npm $(npm -v) ready"

# ==================== STEP 4: FFMPEG ====================
step "Step 4: FFmpeg Install (Audio/Video Features)"
if command -v ffmpeg &>/dev/null; then
    success "FFmpeg already installed: $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
else
    info "Installing ffmpeg..."
    $SUDO_CMD apt-get install -y ffmpeg
    success "FFmpeg installed"
fi

# ==================== STEP 5: PM2 ====================
step "Step 5: PM2 Process Manager"
if command -v pm2 &>/dev/null; then
    success "PM2 already installed: $(pm2 -v)"
else
    info "Installing PM2 globally..."
    $SUDO_CMD npm install -g pm2
    success "PM2 $(pm2 -v) installed"
fi

# PM2 startup configure කරන්න (reboot survive)
info "PM2 startup configure කරනවා..."
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null | tail -1 | bash 2>/dev/null || true
success "PM2 startup configured (VPS reboot survive කරයි)"

# ==================== STEP 6: BOT DIRECTORY ====================
step "Step 6: Bot Directory Setup"

BOT_DIR="$(pwd)"
info "Bot directory: $BOT_DIR"

# logs folder
mkdir -p "$BOT_DIR/logs"
mkdir -p "$BOT_DIR/auth_info"
mkdir -p "$BOT_DIR/temp"

success "Directories created"

# ==================== STEP 7: CONFIG CHECK ====================
step "Step 7: config.env Check"

if [ ! -f "$BOT_DIR/config.env" ]; then
    error "config.env file නැහැ! Bot directory එකේ config.env file එක තියෙන්නෑ."
fi

# Config values check
PHONE=$(grep "^PHONE_NUMBER=" "$BOT_DIR/config.env" | cut -d= -f2 | tr -d '"' | tr -d ' ')
SESSION=$(grep "^SESSION_ID=" "$BOT_DIR/config.env" | cut -d= -f2 | tr -d '"' | tr -d ' ')
USE_PAIR=$(grep "^USE_PAIRING_CODE=" "$BOT_DIR/config.env" | cut -d= -f2 | tr -d '"' | tr -d ' ')
MONGO=$(grep "^MONGODB=" "$BOT_DIR/config.env" | cut -d= -f2 | tr -d '"' | tr -d ' ')

echo ""
echo -e "  ${WHITE}Phone Number  :${NC} ${PHONE:-${RED}NOT SET${NC}}"
echo -e "  ${WHITE}Session ID    :${NC} ${SESSION:+${GREEN}SET (${#SESSION} chars)${NC}}${SESSION:-${YELLOW}NOT SET (Pairing code use වේ)${NC}}"
echo -e "  ${WHITE}Pairing Mode  :${NC} ${USE_PAIR:-false}"
echo -e "  ${WHITE}MongoDB       :${NC} ${MONGO:+${GREEN}SET${NC}}${MONGO:-${YELLOW}NOT SET${NC}}"
echo ""

if [ -z "$PHONE" ]; then
    warn "PHONE_NUMBER set කරලා නැහැ! config.env edit කරන්න."
    echo ""
    echo -e "  ${CYAN}nano config.env${NC}  — edit කරන්නෙ මෙහෙමයි"
    echo ""
fi

# ==================== STEP 8: NPM INSTALL ====================
step "Step 8: npm Dependencies Install"

if [ ! -d "$BOT_DIR/node_modules" ]; then
    info "Dependencies install කරනවා (ටිකක් වෙලා ගනී)..."
    npm install --production 2>&1 | grep -E "(added|warn|error|ERR)" | head -20 || true
else
    info "node_modules already exists. Checking for updates..."
    npm install --production 2>&1 | grep -E "(added|removed|updated|warn)" | head -10 || true
fi

success "Dependencies installed"

# ==================== STEP 9: ECOSYSTEM CONFIG ====================
step "Step 9: PM2 Ecosystem Config"

cat > "$BOT_DIR/ecosystem.config.js" << 'ECOSYSTEM'
module.exports = {
    apps: [
        {
            name: 'apex-md-v2',
            script: 'index.js',
            cwd: './',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            restart_delay: 5000,
            max_restarts: 10,
            min_uptime: '10s',
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            merge_logs: true,
            kill_timeout: 5000
        }
    ]
};
ECOSYSTEM

success "ecosystem.config.js created"

# ==================== STEP 10: START BOT ====================
step "Step 10: Starting Bot with PM2"

# Old instance නැත්නම් stop
pm2 delete apex-md-v2 2>/dev/null && info "Old instance stopped" || true

info "Starting apex-md-v2..."
pm2 start ecosystem.config.js

# PM2 save
pm2 save
success "Bot started with PM2"

# ==================== STEP 11: PAIRING CODE / QR WAIT ====================
step "Step 11: WhatsApp Connection"

echo ""
if [ "$USE_PAIR" = "true" ]; then
    echo -e "${YELLOW}📱 PAIRING CODE MODE${NC}"
    echo -e "${WHITE}Phone: ${CYAN}$PHONE${NC}"
    echo ""
    echo -e "  WhatsApp → Linked Devices → Link with phone number ගිහිල්ලා"
    echo -e "  Phone number enter කරන්නෙ: ${CYAN}$PHONE${NC}"
    echo ""
    echo -e "${WHITE}Pairing code ලබා ගන්නෙ logs ගාන:${NC}"
    echo -e "${CYAN}  pm2 logs apex-md-v2 --lines 50${NC}"
    echo ""
    echo -e "${YELLOW}⏳ 10 seconds logs show කරනවා...${NC}"
    sleep 3
    echo ""
    echo -e "${WHITE}━━━ LIVE LOGS (Ctrl+C to exit) ━━━${NC}"
    timeout 30 pm2 logs apex-md-v2 --lines 30 --nostream 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}💡 Full logs:${NC} ${CYAN}pm2 logs apex-md-v2${NC}"
else
    echo -e "${YELLOW}📷 QR CODE MODE${NC}"
    echo ""
    echo -e "  QR code logs ඇතුළේ appear වෙයි:"
    echo -e "  ${CYAN}pm2 logs apex-md-v2${NC}"
    echo ""
    echo -e "${YELLOW}⏳ Waiting for QR...${NC}"
    sleep 5
    timeout 30 pm2 logs apex-md-v2 --lines 40 --nostream 2>/dev/null || true
fi

# ==================== FINAL STATUS ====================
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${GREEN}              ✅ SETUP COMPLETE!                   ${CYAN}║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${WHITE}  📋 Useful Commands:                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${CYAN}  pm2 status${NC}              — Bot status           ${CYAN}║${NC}"
echo -e "${CYAN}║${CYAN}  pm2 logs apex-md-v2${NC}     — Live logs            ${CYAN}║${NC}"
echo -e "${CYAN}║${CYAN}  pm2 restart apex-md-v2${NC}  — Restart bot          ${CYAN}║${NC}"
echo -e "${CYAN}║${CYAN}  pm2 stop apex-md-v2${NC}     — Stop bot             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${WHITE}  📁 Log files:                                    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ./logs/out.log   (output)                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ./logs/error.log (errors)                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                   ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

pm2 status
