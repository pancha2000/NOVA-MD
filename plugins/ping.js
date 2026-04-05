'use strict';

const { cmd } = require('../lib/commands');
const { runtime } = require('../lib/functions');
const config = require('../config');

cmd({
    pattern:  'ping',
    alias:    ['speed', 'p'],
    desc:     'Bot speed check',
    category: 'main',
    react:    '⚡'
}, async (conn, mek, m, { reply }) => {
    const start = Date.now();
    await reply('Pinging...');
    const ms = Date.now() - start;
    await reply(
`╔═══════════════════╗
║  ⚡ PONG!          ║
╚═══════════════════╝

📡 Speed   : *${ms}ms*
⏱️ Uptime  : *${runtime(process.uptime())}*
🤖 Bot     : *${config.BOT_NAME}*
📌 Prefix  : *${config.PREFIX}*
✅ Status  : *Online*`
    );
});

cmd({
    pattern:  'alive',
    alias:    ['online', 'bot'],
    desc:     'Check bot status',
    category: 'main',
    react:    '👋'
}, async (conn, mek, m, { reply }) => {
    await reply(
`╔═══════════════════╗
║  ✅ APEX-MD V2    ║
╚═══════════════════╝

⏱️ Uptime  : *${runtime(process.uptime())}*
👤 Owner   : *${config.OWNER_NAME}*
📌 Prefix  : *${config.PREFIX}*
⚙️ Mode    : *${config.MODE}*
🚀 Version : *2.0.0*`
    );
});
