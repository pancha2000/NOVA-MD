/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║   ERROR MANAGEMENT COMMANDS - Owner Only                  ║
 * ║   View error logs, stats, and manage error history        ║
 * ║   FIXED: addCommand now properly exported                 ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

// ✅ FIXED: addCommand is now exported from lib/commands
const { addCommand } = require('../lib/commands');
const { getErrorStats, clearErrorHistory, DEVELOPER_INFO } = require('../lib/errorHandler');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// ═══════════════════════════════════════════════════════════
// VIEW ERROR LOGS
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'errorlogs',
    alias: ['errors', 'errlogs'],
    desc: 'View recent error logs',
    category: 'owner',
    isOwner: true,
    react: '📊'
}, async (conn, mek, m, { reply }) => {
    try {
        const logPath = path.join(__dirname, '..', 'error_logs.txt');
        
        if (!fs.existsSync(logPath)) {
            return await reply('✅ තවම errors නැහැ! Bot එක හොඳට run වෙනවා.');
        }

        const logs = fs.readFileSync(logPath, 'utf-8');
        const logEntries = logs.split('═══════════════════════════════════════════════════════════');
        const recentLogs = logEntries.slice(-5).join('\n\n');

        if (!recentLogs.trim()) {
            return await reply('✅ තවම errors නැහැ!');
        }

        // Send as document if too long
        if (recentLogs.length > 4000) {
            await conn.sendMessage(m.from, {
                document: Buffer.from(logs),
                fileName: 'error_logs.txt',
                mimetype: 'text/plain',
                caption: '📊 *Complete Error Logs*\n\nඅවසාන errors ටික මේ file එකේ තියනවා.'
            }, { quoted: mek });
        } else {
            await reply(`📊 *Recent Error Logs*\n\n${recentLogs.substring(0, 4000)}`);
        }

    } catch (e) {
        await reply(`❌ Error logs load කරන්න බැරි වුණා: ${e.message}`);
    }
});

// ═══════════════════════════════════════════════════════════
// ERROR STATISTICS
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'errorstats',
    alias: ['errstats'],
    desc: 'View error statistics',
    category: 'owner',
    isOwner: true,
    react: '📈'
}, async (conn, mek, m, { reply }) => {
    try {
        const stats = getErrorStats();
        
        const message = `╔═══════════════════════════════════╗
║     📊 ERROR STATISTICS          ║
╚═══════════════════════════════════╝

📝 *Total Errors Logged:* ${stats.total}
🔢 *Unique Errors:* ${stats.unique}

━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *Recent Errors:*
${stats.recent.length > 0 
    ? stats.recent.map((e, i) => `${i + 1}. ${e.context || 'Unknown'}`).join('\n')
    : '✅ No recent errors'
}

━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Commands:*
• .errorlogs - View detailed logs
• .clearerrors - Clear error history
• .testemergency - Test emergency notification

━━━━━━━━━━━━━━━━━━━━━━━━━

*APEX-MD V2 Error Monitoring*`;

        await reply(message);

    } catch (e) {
        await reply(`❌ Stats load කරන්න බැරි වුණා: ${e.message}`);
    }
});

// ═══════════════════════════════════════════════════════════
// CLEAR ERROR HISTORY
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'clearerrors',
    alias: ['eraseerrors'],
    desc: 'Clear error history and logs',
    category: 'owner',
    isOwner: true,
    react: '🗑️'
}, async (conn, mek, m, { reply }) => {
    try {
        // Clear in-memory errors
        clearErrorHistory();
        
        // Clear log file
        const logPath = path.join(__dirname, '..', 'error_logs.txt');
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '');
        }

        await reply(`✅ *Error History Cleared!*

සියලුම error logs සහ history clear කරලා.

🔄 Bot එක fresh start එකකින් run වෙනවා.`);

    } catch (e) {
        await reply(`❌ Clear කරන්න බැරි වුණා: ${e.message}`);
    }
});

// ═══════════════════════════════════════════════════════════
// TEST EMERGENCY NOTIFICATION
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'testemergency',
    alias: ['testerror'],
    desc: 'Test emergency error notification system',
    category: 'owner',
    isOwner: true,
    react: '🧪'
}, async (conn, mek, m, { reply }) => {
    try {
        const { sendErrorToOwner } = require('../lib/errorHandler');
        
        // Create test error
        const testError = new Error('This is a test error notification');
        testError.stack = 'Test Stack Trace\n  at testFunction (/test.js:10:5)\n  at main (/index.js:20:3)';
        
        await reply('🧪 Emergency notification system test කරනවා...');
        
        // Send test error
        await sendErrorToOwner(conn, testError, 'Emergency Test');
        
        await reply('✅ Test notification එක send කරලා!\n\nOwner number එකට message එකක් ආවා නම් system එක හරියට work කරනවා.');

    } catch (e) {
        await reply(`❌ Test කරන්න බැරි වුණා: ${e.message}`);
    }
});

// ═══════════════════════════════════════════════════════════
// DEVELOPER CONTACT INFO
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'devcontact',
    alias: ['developer', 'support'],
    desc: 'Get developer contact information',
    category: 'owner',
    react: '📞'
}, async (conn, mek, m, { reply }) => {
    try {
        const message = `╔═══════════════════════════════════╗
║     📞 DEVELOPER CONTACT         ║
╚═══════════════════════════════════╝

👨‍💻 *Developer:* ${DEVELOPER_INFO.name}

━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *WhatsApp:*
wa.me/${DEVELOPER_INFO.whatsapp}

💬 *Telegram:*
${DEVELOPER_INFO.telegram}

📧 *Email:*
${DEVELOPER_INFO.email}

🔗 *GitHub:*
${DEVELOPER_INFO.github}

👥 *Support Group:*
${DEVELOPER_INFO.support_group}

━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Bot Customization:*
Bot එකේ special features, custom commands, හෝ API integrations අවශ්‍ය නම් developer ට contact කරන්න.

🛠️ *Technical Support:*
Deploy කරන්න අමාරුද? Errors තියනවද? Developer ට message කරන්න - මම help කරන්නම්!

━━━━━━━━━━━━━━━━━━━━━━━━━

*APEX-MD V2 Enhanced*
_Created by ${DEVELOPER_INFO.name}_`;

        await conn.sendMessage(m.from, {
            text: message,
            contextInfo: {
                externalAdReply: {
                    title: 'Contact Developer',
                    body: 'APEX-MD V2 - Support',
                    thumbnail: await (await fetch('https://i.imgur.com/VlZ2Y0l.jpeg')).buffer(),
                    mediaType: 1,
                    sourceUrl: DEVELOPER_INFO.telegram
                }
            }
        }, { quoted: mek });

    } catch (e) {
        await reply(`❌ Contact info load කරන්න බැරි වුණා: ${e.message}`);
    }
});

// ═══════════════════════════════════════════════════════════
// SYSTEM HEALTH CHECK
// ═══════════════════════════════════════════════════════════
addCommand({
    pattern: 'health',
    alias: ['status', 'systemstatus'],
    desc: 'Check bot system health',
    category: 'owner',
    isOwner: true,
    react: '🏥'
}, async (conn, mek, m, { reply }) => {
    try {
        const os = require('os');
        const stats = getErrorStats();
        
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const message = `╔═══════════════════════════════════╗
║     🏥 SYSTEM HEALTH CHECK       ║
╚═══════════════════════════════════╝

⏰ *Uptime:*
${hours}h ${minutes}m ${seconds}s

💾 *Memory Usage:*
${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB

🖥️ *CPU:*
${os.cpus()[0].model}

📊 *Platform:*
${os.platform()} ${os.arch()}

━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ *Error Handler:*
✅ Active & Monitoring

📝 *Total Errors:* ${stats.total}
🔢 *Unique Errors:* ${stats.unique}

━━━━━━━━━━━━━━━━━━━━━━━━━

🔋 *Status:* ${stats.total < 10 ? '✅ Healthy' : '⚠️ Needs Attention'}

💡 Use .errorlogs to view details

━━━━━━━━━━━━━━━━━━━━━━━━━

*APEX-MD V2 System Monitor*`;

        await reply(message);

    } catch (e) {
        await reply(`❌ Health check කරන්න බැරි වුණා: ${e.message}`);
    }
});

console.log('✅ Error Management Commands loaded!');
