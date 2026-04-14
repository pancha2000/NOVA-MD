const { cmd, handler } = require('../lib/commands');
const config           = require('../config');
const { runtime }      = require('../lib/functions');

cmd({
    pattern:  'menu',
    alias:    ['help', 'commands', 'list', 'සියල්ල'],
    desc:     'All commands ලැයිස්තුව',
    category: 'main',
    react:    '📜',
    filename: __filename
},
async (conn, mek, m, { reply, args }) => {
    try {
        const uptime     = runtime(process.uptime());
        const allCmds    = handler.getCommands();
        const categories = handler.getCategories();
        const now        = new Date().toLocaleString('en-US', {
            timeZone: config.TIME_ZONE || 'Asia/Colombo',
            hour12: true, hour: '2-digit', minute: '2-digit'
        });

        // ── Category filter: .menu group ──────────────────────────────────────
        const filterCat = args[0]?.toLowerCase();
        if (filterCat && categories.includes(filterCat)) {
            const cmds = handler.getCommandsByCategory(filterCat);
            let text =
                `╔══════════════════════════════════╗\n` +
                `║  📂 *${filterCat.toUpperCase().padEnd(28)}*║\n` +
                `╚══════════════════════════════════╝\n\n`;

            cmds.forEach(c => {
                text += `┌─ *${config.PREFIX}${c.pattern}*\n`;
                if (c.alias?.length) text += `│  ↪ Alias: ${c.alias.map(a => config.PREFIX + a).join(', ')}\n`;
                text += `│  📝 ${c.desc}\n`;
                text += `└──────────────────\n\n`;
            });

            text += `> 💡 *${cmds.length} commands found in [${filterCat}]*`;
            return await conn.sendMessage(m.from, { text }, { quoted: mek });
        }

        // ── Full menu ─────────────────────────────────────────────────────────
        const catEmojis = {
            main:     '🏠',
            owner:    '👑',
            group:    '👥',
            download: '📥',
            tools:    '🛠️',
            fun:      '🎉',
            ai:       '🤖',
            misc:     '🔧',
            upload:   '📤',
            downloader: '📥',
        };

        let text =
            `╔═══════════════════════════════════╗\n` +
            `║        🤖  NOVA-MD  MENU          ║\n` +
            `╚═══════════════════════════════════╝\n\n` +
            `╭─── 『 *BOT INFO* 』 ────────────\n` +
            `│ 🤖 *Bot    :* ${config.BOT_NAME}\n` +
            `│ 👤 *Owner  :* ${config.OWNER_NAME}\n` +
            `│ 📌 *Prefix :* \`${config.PREFIX}\`\n` +
            `│ ⚙️ *Mode   :* ${config.MODE}\n` +
            `│ ⏱️ *Uptime :* ${uptime}\n` +
            `│ 🕐 *Time   :* ${now}\n` +
            `│ 📦 *Version:* ${config.VERSION}\n` +
            `│ 🔢 *Cmds   :* ${allCmds.length} total\n` +
            `╰─────────────────────────────────\n\n`;

        categories.forEach(cat => {
            const cmds = handler.getCommandsByCategory(cat);
            if (!cmds.length) return;

            const emoji = catEmojis[cat] || '📂';
            text += `╭─── ${emoji} 『 *${cat.toUpperCase()}* 』 ────────\n`;
            cmds.forEach(c => {
                const aliases = c.alias?.length ? ` _(${c.alias.join(', ')})_` : '';
                text += `│  ◦ ${config.PREFIX}${c.pattern}${aliases}\n`;
            });
            text += `╰─────────────────────────────────\n\n`;
        });

        text +=
            `╭─── 💡 *HOW TO USE* ────────────\n` +
            `│ ◦ Command: \`${config.PREFIX}ping\`\n` +
            `│ ◦ Category filter: \`${config.PREFIX}menu group\`\n` +
            `╰─────────────────────────────────\n\n` +
            `> 🚀 *NOVA-MD* © ${new Date().getFullYear()} | Powered by Baileys`;

        // Send with image if configured
        if (config.MENU_IMG) {
            await conn.sendMessage(m.from, {
                image:   { url: config.MENU_IMG },
                caption: text
            }, { quoted: mek });
        } else {
            await conn.sendMessage(m.from, { text }, { quoted: mek });
        }

    } catch (e) {
        await reply('❌ Menu error: ' + e.message);
    }
});
