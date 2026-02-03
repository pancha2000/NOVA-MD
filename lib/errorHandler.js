/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║   APEX-MD V2 - Advanced Error Handler with AI Support    ║
 * ║   Auto sends errors to owner with AI solutions            ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

// Developer Contact Info (නොවෙනස්වන තැන)
const DEVELOPER_INFO = {
    name: "Shehan Vimukthi",
    whatsapp: "94762898915",
    github: "https://github.com/ShehanVimukthii",
    telegram: "https://t.me/shehanvimukthi",
    email: "shehanvimukthi@gmail.com",
    support_group: "https://chat.whatsapp.com/your-support-group"
};

// Error tracking
const errorLog = [];
const sentErrors = new Set(); // Prevent duplicate error messages

/**
 * Format error message with AI solution
 */
async function getAISolution(error, context) {
    if (!config.GEMINI_API) {
        return "⚠️ GEMINI_API නැහැ. AI solution එක ගන්න බැහැ.";
    }

    try {
        const genAI = new GoogleGenerativeAI(config.GEMINI_API);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `You are an expert WhatsApp bot developer. Analyze this error and provide a solution in Sinhala (සිංහල).

**Error Details:**
- Error: ${error.message}
- Context: ${context}
- Stack: ${error.stack?.split('\n').slice(0, 3).join('\n')}

**Bot Info:**
- Bot: APEX-MD V2
- Framework: Baileys (WhatsApp Web API)
- Language: Node.js

Provide:
1. කෙටි විස්තරයක් (What happened)
2. හේතුව (Why it happened)
3. විසඳුම (How to fix)

Keep it concise and in Sinhala. Format with emojis for clarity.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.log('AI Solution Error:', e.message);
        return "❌ AI solution එක generate කරන්න බැරි වුණා.";
    }
}

/**
 * Send error to owner via WhatsApp
 */
async function sendErrorToOwner(conn, error, context) {
    try {
        // Get owner number from config
        const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        // Create unique error ID
        const errorId = `${context}_${error.message}`.substring(0, 100);
        
        // Check if already sent (prevent spam)
        if (sentErrors.has(errorId)) {
            return;
        }
        sentErrors.add(errorId);

        // Get AI solution
        const aiSolution = await getAISolution(error, context);

        // Format error message
        const timestamp = new Date().toLocaleString('en-US', { 
            timeZone: config.TIME_ZONE,
            dateStyle: 'medium',
            timeStyle: 'medium'
        });

        let errorMessage = `╔═══════════════════════════════════╗
║   🚨 BOT ERROR ALERT 🚨          ║
╚═══════════════════════════════════╝

⏰ *Time:* ${timestamp}
📍 *Location:* ${context}

━━━━━━━━━━━━━━━━━━━━━━━━━

❌ *Error:*
\`\`\`${error.message}\`\`\`

📝 *Error Type:*
${error.name || 'Unknown'}

━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 *AI විසඳුම:*

${aiSolution}

━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 *Stack Trace:*
\`\`\`
${error.stack?.split('\n').slice(0, 5).join('\n') || 'No stack trace'}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━

📞 *Developer Support:*

👨‍💻 *Name:* ${DEVELOPER_INFO.name}
📱 *WhatsApp:* wa.me/${DEVELOPER_INFO.whatsapp}
💬 *Telegram:* ${DEVELOPER_INFO.telegram}
📧 *Email:* ${DEVELOPER_INFO.email}
🔗 *GitHub:* ${DEVELOPER_INFO.github}
👥 *Support Group:* ${DEVELOPER_INFO.support_group}

━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Quick Actions:*
• Bot restart කරන්න: .restart
• Debug mode on කරන්න: .debug on
• Logs check කරන්න: .logs

🔔 මේ error එක auto-detected වුණා.
Bot එක crash නොවී run වෙනවා.

━━━━━━━━━━━━━━━━━━━━━━━━━

*APEX-MD V2 Enhanced Error Handler*
_Powered by Gemini AI_`;

        // Send to owner
        await conn.sendMessage(ownerNumber, { 
            text: errorMessage 
        });

        // Also log to file
        logErrorToFile(error, context, aiSolution);

        console.log(`✅ Error එක owner ට send කරලා: ${context}`);

    } catch (e) {
        console.log('❌ Owner ට error එක send කරන්න බැරි වුණා:', e.message);
    }
}

/**
 * Log error to file
 */
function logErrorToFile(error, context, solution) {
    try {
        const logPath = path.join(__dirname, '..', 'error_logs.txt');
        const timestamp = new Date().toISOString();
        
        const logEntry = `
═══════════════════════════════════════════════════════════
[${timestamp}] ERROR LOG
═══════════════════════════════════════════════════════════
Context: ${context}
Error: ${error.message}
Type: ${error.name}
Stack: ${error.stack}

AI Solution:
${solution}

═══════════════════════════════════════════════════════════

`;

        fs.appendFileSync(logPath, logEntry);
    } catch (e) {
        console.log('File log error:', e.message);
    }
}

/**
 * Wrap async function with error handler
 */
function withErrorHandler(context) {
    return function(fn) {
        return async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                console.log(`❌ Error in ${context}:`, error.message);
                
                // Get connection from args if available
                const conn = args.find(arg => arg?.sendMessage);
                
                if (conn) {
                    await sendErrorToOwner(conn, error, context);
                }
                
                // Return null or default value instead of crashing
                return null;
            }
        };
    };
}

/**
 * Global error handlers with owner notification
 */
function setupGlobalErrorHandlers(conn) {
    // Uncaught exceptions
    process.on('uncaughtException', async (err) => {
        console.log('❌ Uncaught Exception:', err.message);
        
        if (conn) {
            await sendErrorToOwner(conn, err, 'Uncaught Exception');
        }
        
        // Don't exit - keep bot running
        if (config.DEBUG === 'true') {
            console.log(err);
        }
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', async (err) => {
        console.log('❌ Unhandled Rejection:', err?.message || err);
        
        if (conn) {
            await sendErrorToOwner(conn, 
                err instanceof Error ? err : new Error(String(err)), 
                'Unhandled Promise Rejection'
            );
        }
        
        // Don't exit - keep bot running
        if (config.DEBUG === 'true') {
            console.log(err);
        }
    });

    // Warning events
    process.on('warning', async (warning) => {
        console.log('⚠️ Warning:', warning.message);
        
        if (config.DEBUG === 'true' && conn) {
            await sendErrorToOwner(conn, warning, 'Node.js Warning');
        }
    });

    console.log('✅ Global error handlers setup කරලා (Owner notification සමඟ)');
}

/**
 * Send startup notification to owner
 */
async function sendStartupNotification(conn) {
    try {
        const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        const message = `╔═══════════════════════════════════╗
║   ✅ BOT STARTED SUCCESSFULLY    ║
╚═══════════════════════════════════╝

🤖 *Bot:* ${config.BOT_NAME}
📌 *Version:* ${config.VERSION}
⏰ *Started:* ${new Date().toLocaleString('en-US', { timeZone: config.TIME_ZONE })}

━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ *Error Handler Status:*
✅ AI-Powered Error Detection
✅ Auto WhatsApp Notifications
✅ Crash Prevention Active
✅ Error Logging Enabled

━━━━━━━━━━━━━━━━━━━━━━━━━

📞 *Developer Info:*
👨‍💻 ${DEVELOPER_INFO.name}
📱 wa.me/${DEVELOPER_INFO.whatsapp}
💬 ${DEVELOPER_INFO.telegram}

━━━━━━━━━━━━━━━━━━━━━━━━━

💡 ඕනම error එකක් ආවනම් auto ම owner ට message එකක් එනවා AI solution එක සමඟ!

🚀 *Bot is ready to serve!*`;

        await conn.sendMessage(ownerNumber, { text: message });
        console.log('✅ Startup notification owner ට send කරලා');
    } catch (e) {
        console.log('Startup notification error:', e.message);
    }
}

/**
 * Get error statistics
 */
function getErrorStats() {
    return {
        total: errorLog.length,
        unique: sentErrors.size,
        recent: errorLog.slice(-5)
    };
}

/**
 * Clear error history (for .clearerrors command)
 */
function clearErrorHistory() {
    errorLog.length = 0;
    sentErrors.clear();
    return true;
}

module.exports = {
    sendErrorToOwner,
    withErrorHandler,
    setupGlobalErrorHandlers,
    sendStartupNotification,
    getErrorStats,
    clearErrorHistory,
    DEVELOPER_INFO
};
