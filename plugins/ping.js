'use strict';

const { cmd }     = require('../lib/commands');
const { runtime } = require('../lib/utils');
const config      = require('../config');

// ── .ping ────────────────────────────────────────────────────────────────────
cmd({
    pattern:  'ping',
    alias:    ['speed', 'p'],
    desc:     'Bot speed check',
    category: 'main',
    react:    '⚡'
}, async (_conn, _mek, _m, { reply }) => {
    const start = Date.now();
    await reply('🏓 Pinging...');
    const ms = Date.now() - start;
    await reply(
`╔══════════════════════╗
║    ⚡  P O N G !     ║
╚══════════════════════╝

📡 *Speed*   : ${ms}ms
⏱️  *Uptime*  : ${runtime(process.uptime())}
🤖 *Bot*     : ${config.BOT_NAME}
📌 *Prefix*  : ${config.PREFIX}
✅ *Status*  : Online`
    );
});

// ── .alive ───────────────────────────────────────────────────────────────────
cmd({
    pattern:  'alive',
    alias:    ['online', 'bot'],
    desc:     'Bot status',
    category: 'main',
    react:    '✅'
}, async (_conn, _mek, _m, { reply }) => {
    await reply(
`╔══════════════════════╗
║    ✅  A L I V E !   ║
╚══════════════════════╝

⏱️  *Uptime*  : ${runtime(process.uptime())}
👤 *Owner*   : ${config.OWNER_NAME}
📌 *Prefix*  : ${config.PREFIX}
⚙️  *Mode*    : ${config.MODE}
🚀 *Version* : 2.0.0`
    );
});
