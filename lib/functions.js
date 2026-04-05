const { cmd } = require('../lib/commands');

cmd({
    pattern:  'ping',
    alias:    ['speed', 'test'],
    desc:     "Bot speed check කරන්න",
    category: 'main',
    react:    '⚡',
    filename: __filename
},
async (conn, mek, m, { reply }) => {
    try {
        const start = Date.now();
        await reply('🏓 Testing...');
        const ms = Date.now() - start;
        await reply(
            `⚡ *PONG!*\n\n` +
            `📊 *Speed:* ${ms}ms\n` +
            `🤖 *Bot:* NOVA-MD\n` +
            `✅ *Status:* Online`
        );
    } catch (e) {
        await reply('❌ Error: ' + e.message);
    }
});
