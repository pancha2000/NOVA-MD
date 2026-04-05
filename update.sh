#!/bin/bash

# ╔═══════════════════════════════════════════╗
# ║      NOVA-MD  —  Update Script            ║
# ║   GitHub ඉදල pull කරල restart කරනවා     ║
# ╚═══════════════════════════════════════════╝

GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RED='\033[0;31m'
BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

BOT_DIR="$HOME/nova-md"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        🔄  NOVA-MD  UPDATE               ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Bot folder check
if [ ! -d "$BOT_DIR" ]; then
    err "$BOT_DIR නැහැ!先 bash setup.sh run කරන්න."
fi

cd "$BOT_DIR"

# ── 1. Git pull ───────────────────────────────────────────────────────────────
if [ -d ".git" ]; then
    info "GitHub ඉදල latest files pull කරනවා..."

    # auth_info folder protect — session files delete වෙන්න ඕන නෑ
    echo "auth_info/" >> .gitignore 2>/dev/null || true
    echo "tmp/" >> .gitignore 2>/dev/null || true
    echo "node_modules/" >> .gitignore 2>/dev/null || true

    git fetch origin
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
    log "Git pull done"
else
    warn ".git folder නෑ. Manual copy mode..."

    # GitHub repo clone කරල files copy
    if [ -z "$1" ]; then
        echo -e "${YELLOW}Usage: bash update.sh https://github.com/youruser/nova-md${NC}"
        echo -e "${YELLOW}       හෝ bot folder එකේ git init කරන්න${NC}"
        exit 1
    fi

    TEMP_DIR="/tmp/nova-md-update-$$"
    git clone "$1" "$TEMP_DIR" --depth=1 -q
    log "Repo cloned"

    # Files copy — auth_info skip කරනවා (session data)
    rsync -av --exclude='auth_info/' --exclude='node_modules/' --exclude='.git/' \
        "$TEMP_DIR/" "$BOT_DIR/" > /dev/null
    rm -rf "$TEMP_DIR"
    log "Files updated"
fi

# ── 2. package.json check — නව package තිබ්බොත් install ─────────────────────
info "Dependencies check කරනවා..."

# package.json change වෙලාද check
NEEDS_INSTALL=false

if git diff HEAD@{1} HEAD -- package.json 2>/dev/null | grep -q "^+"; then
    NEEDS_INSTALL=true
    info "package.json change වෙලා — npm install කරනවා..."
fi

# node_modules නැතිනම් install කරනවා
if [ ! -d "node_modules" ]; then
    NEEDS_INSTALL=true
fi

if [ "$NEEDS_INSTALL" = true ]; then
    npm install --omit=dev --silent
    log "npm install done"
else
    log "Dependencies — no changes, skip"
fi

# ── 3. PM2 restart ───────────────────────────────────────────────────────────
info "Bot restart කරනවා..."

if pm2 list | grep -q "nova-md"; then
    pm2 reload nova-md --update-env
    log "PM2 reloaded (zero downtime)"
else
    pm2 start index.js \
        --name "nova-md" \
        --restart-delay=5000 \
        --max-restarts=10 \
        --time
    pm2 save
    log "PM2 started fresh"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          ✅  UPDATE COMPLETE!             ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  📜 Logs   : ${CYAN}pm2 logs nova-md${NC}"
echo -e "  📋 Status : ${CYAN}pm2 status${NC}"
echo ""
