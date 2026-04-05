const config = require('../config');

/**
 * Owner ට error message එකක් යවනවා
 */
async function sendErrorToOwner(conn, error, context = 'Unknown') {
    if (!conn || !config.OWNER_NUMBER) return;
    try {
        const ownerJid = `${config.OWNER_NUMBER.trim()}@s.whatsapp.net`;
        const errorMsg =
            `🚨 *NOVA-MD ERROR ALERT*\n\n` +
            `📍 *Context:* ${context}\n` +
            `❌ *Error:* ${error.message}\n` +
            `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: config.TIME_ZONE || 'Asia/Colombo' })}\n\n` +
            `_Auto error detection active_`;
        await conn.sendMessage(ownerJid, { text: errorMsg });
    } catch (e) {
        console.log('sendErrorToOwner failed:', e.message);
    }
}

/**
 * Startup notification
 */
async function sendStartupNotification(conn) {
    if (!conn || !config.OWNER_NUMBER) return;
    try {
        const ownerJid = `${config.OWNER_NUMBER.trim()}@s.whatsapp.net`;
        await conn.sendMessage(ownerJid, {
            text:
                `✅ *NOVA-MD STARTED*\n\n` +
                `🤖 *Bot:* ${config.BOT_NAME}\n` +
                `📌 *Prefix:* ${config.PREFIX}\n` +
                `⚙️ *Mode:* ${config.MODE}\n` +
                `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: config.TIME_ZONE || 'Asia/Colombo' })}`
        });
    } catch (e) {
        console.log('sendStartupNotification failed:', e.message);
    }
}

/**
 * Global process error handlers
 */
function setupGlobalErrorHandlers(conn) {
    process.on('unhandledRejection', async (reason) => {
        console.log('🔴 Unhandled Rejection:', reason);
        await sendErrorToOwner(conn, new Error(String(reason)), 'unhandledRejection');
    });

    process.on('uncaughtException', async (err) => {
        console.log('🔴 Uncaught Exception:', err.message);
        await sendErrorToOwner(conn, err, 'uncaughtException');
    });
}

/**
 * Higher-order wrapper for any async function
 */
function withErrorHandler(context) {
    return (fn) => {
        return async function (...args) {
            try {
                return await fn(...args);
            } catch (e) {
                console.log(`❌ Error in [${context}]:`, e.message);
                throw e;
            }
        };
    };
}

module.exports = {
    sendErrorToOwner,
    sendStartupNotification,
    setupGlobalErrorHandlers,
    withErrorHandler
};
