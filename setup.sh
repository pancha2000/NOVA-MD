#!/bin/bash
# ══════════════════════════════════════════
#    APEX-MD V2  —  VPS Setup Script
# ══════════════════════════════════════════
set -e

G='\033[0;32m'; C='\033[0;36m'; Y='\033[1;33m'; W='\033[1;37m'; N='\033[0m'

banner() { echo -e "${C}━━━  $1  ━━━${N}"; }

echo -e "\n${C}╔══════════════════════════════════════════╗"
echo -e "║      🚀  APEX-MD V2  Setup               ║"
echo -e "╚══════════════════════════════════════════╝${N}\n"

SUDO="" ; [ "$EUID" -ne 0 ] && SUDO="sudo"

# ── 1. Node.js 20 ─────────────────────────────────────────────────────────────
banner "Node.js check"
if command -v node &>/dev/null && [ "$(node -v | grep -oP '\d+' | head -1)" -ge 20 ]; then
    echo -e "${G}✓ Node $(node -v)${N}"
else
    echo "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
    echo -e "${G}✓ Node $(node -v)${N}"
fi

# ── 2. PM2 ─────────────────────────────────────────────────────────────────────
banner "PM2"
command -v pm2 &>/dev/null || $SUDO npm i -g pm2
echo -e "${G}✓ PM2 $(pm2 -v)${N}"

# ── 3. Folders ─────────────────────────────────────────────────────────────────
banner "Folders"
mkdir -p logs auth_info temp
echo -e "${G}✓ Done${N}"

# ── 4. npm install ─────────────────────────────────────────────────────────────
banner "npm install"
npm install
echo -e "${G}✓ Done${N}"

# ── 5. PM2 startup (survive reboot) ───────────────────────────────────────────
banner "PM2 startup"
pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true
echo -e "${G}✓ Done${N}"

# ── 6. Start ───────────────────────────────────────────────────────────────────
banner "Start bot"
pm2 delete apex-md-v2 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# ── 7. Info ────────────────────────────────────────────────────────────────────
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
USE_PAIR=$(grep "^USE_PAIRING_CODE" config.env | cut -d= -f2)
PHONE=$(grep "^PHONE_NUMBER" config.env | cut -d= -f2)

echo ""
echo -e "${C}╔══════════════════════════════════════════╗"
echo -e "║           ✅  Setup Complete!             ║"
echo -e "╠══════════════════════════════════════════╣${N}"

if [ "$USE_PAIR" = "true" ]; then
echo -e "${C}║${Y}  📱 Pairing Code mode                    ${C}║"
echo -e "║${N}  Phone : ${W}$PHONE${N}"
echo -e "${C}║${N}                                          ${C}║"
echo -e "║${N}  Pairing code ලබා ගන්නෙ:                ${C}║"
echo -e "║${Y}  pm2 logs apex-md-v2                     ${C}║"
else
echo -e "${C}║${Y}  📷 QR Code mode                         ${C}║"
echo -e "║${N}  QR: ${W}pm2 logs apex-md-v2${N}               ${C}║"
fi

echo -e "${C}╠══════════════════════════════════════════╣"
echo -e "║${W}  Commands:                               ${C}║"
echo -e "║${N}  pm2 logs apex-md-v2                     ${C}║"
echo -e "║${N}  pm2 restart apex-md-v2                  ${C}║"
echo -e "║${N}  pm2 status                              ${C}║"
echo -e "╚══════════════════════════════════════════╝${N}"
echo ""
pm2 logs apex-md-v2 --lines 30 --nostream
