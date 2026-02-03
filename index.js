/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║   APEX-MD V2 ENHANCED - WhatsApp Bot                      ║
 * ║   Created by: Shehan Vimukthi                             ║
 * ║   Enhanced with AI Features + Speed Mode V2              ║
 * ║   ⚡ Pure Optimization - NO Feature Loss                 ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const Baileys = require('@whiskeysockets/baileys');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    delay
} = Baileys;

// makeInMemoryStore may not exist in all versions
const makeInMemoryStore = Baileys.makeInMemoryStore || null;

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcode = require('qrcode-terminal');
const { File } = require('megajs');

const config = require('./config');
const { connectDB, getGroup, updateGroup, getUser, addWarning, getWarnings, clearWarnings } = require('./lib/database');
const { handler } = require('./lib/commands');
const { serialize } = require('./lib/functions');

// ════════════════════════════════════════════════════════════════════
// SPEED MODE V2 - Initialize (NEW)
// ════════════════════════════════════════════════════════════════════
const SpeedModeV2 = require('./speedMode_v2');

// Initialize Speed Mode V2
global.speedMode = new SpeedModeV2({
    enabled: config.SPEED_MODE_ENABLED === 'true',
    level: config.SPEED_MODE_LEVEL || 'balanced'
});

// Auto-enable if configured
if (config.SPEED_MODE_ENABLED === 'true') {
    global.speedMode.enable(config.SPEED_MODE_LEVEL || 'balanced');
    console.log('');
    global.speedMode.showStatus();
    console.log('');
}

// ════════════════════════════════════════════════════════════════════

// Express server
const app = express();
const PORT = config.PORT || 8000;

// Store (optional - may not be available in all Baileys versions)
let store = null;
if (makeInMemoryStore && typeof makeInMemoryStore === 'function') {
    try {
        store = makeInMemoryStore({ 
            logger: pino().child({ level: 'silent', stream: 'store' }) 
        });
        console.log('✅ Message store enabled');
    } catch (e) {
        console.log('⚠️  Store initialization failed:', e.message);
    }
} else {
    console.log('⚠️  makeInMemoryStore not available in this Baileys version');
}

// Auth folder
const authFolder = path.join(__dirname, 'auth_info');
if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
}

// Temp folder for downloads
const tempFolder = path.join(__dirname, 'temp');
if (!fs.existsSync(tempFolder)) {
    fs.mkdirSync(tempFolder, { recursive: true });
}

/**
 * Load all plugins
 */
function loadPlugins() {
    const pluginFolder = path.join(__dirname, 'plugins');
    
    if (!fs.existsSync(pluginFolder)) {
        console.log('⚠️  Plugins folder නැහැ!');
        return;
    }

    let loaded = 0;

    // Load plugins from subdirectories
    const categories = ['downloads', 'ai', 'group', 'owner', 'utils', 'fun', 'media'];
    
    categories.forEach(category => {
        const categoryPath = path.join(pluginFolder, category);
        if (fs.existsSync(categoryPath)) {
            const files = fs.readdirSync(categoryPath);
            files.forEach(file => {
                if (file.endsWith('.js')) {
                    try {
                        require(path.join(categoryPath, file));
                        loaded++;
                    } catch (e) {
                        console.log(`❌ Plugin Load Error [${category}/${file}]:`, e.message);
                    }
                }
            });
        }
    });

    // Load root level plugins
    const rootFiles = fs.readdirSync(pluginFolder);
    rootFiles.forEach(file => {
        if (file.endsWith('.js')) {
            try {
                require(path.join(pluginFolder, file));
                loaded++;
            } catch (e) {
                console.log(`❌ Plugin Load Error [${file}]:`, e.message);
            }
        }
    });

    console.log(`✅ Loaded ${loaded} plugins successfully`);
}

/**
 * Download session from Mega.nz
 */
async function downloadSession() {
    if (!config.SESSION_ID) {
        console.log('⚠️  SESSION_ID නැහැ config.env එකේ!');
        return false;
    }

    // Check if creds.json already exists
    if (fs.existsSync(path.join(authFolder, 'creds.json'))) {
        console.log('✅ Session දැනටමත් තියනවා');
        return true;
    }

    console.log('📥 Downloading session from Mega.nz...');

    try {
        let sessionUrl = config.SESSION_ID.trim();

        // Remove any "APEX~" or similar prefixes
        sessionUrl = sessionUrl.replace(/^APEX~/i, '');
        sessionUrl = sessionUrl.replace(/^apex-md~/i, '');
        sessionUrl = sessionUrl.replace(/^apex~/i, '');

        // If it's not a full URL, make it one
        if (!sessionUrl.includes('mega.nz')) {
            sessionUrl = `https://mega.nz/file/${sessionUrl}`;
        }

        console.log('🔗 Mega File Code:', sessionUrl.split('/file/')[1] || sessionUrl);

        // Download from Mega
        const file = File.fromURL(sessionUrl);
        await file.loadAttributes();
        
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        // Save to auth folder
        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        fs.writeFileSync(path.join(authFolder, 'creds.json'), data);
        console.log('✅ Session download කරන එක සාර්ථකයි!');
        return true;

    } catch (error) {
        console.log('❌ Mega Session Download Failed:', error.message);
        console.log('💡 Tip: Mega link එක හරිද බලන්න');
        return false;
    }
}

/**
 * Start bot connection
 */
async function startBot() {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║    🚀 APEX-MD V2 ENHANCED Starting...   ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');

    // Download session from Mega if needed
    if (config.SESSION_ID) {
        await downloadSession();
    }

    // Connect to database
    if (config.MONGODB) {
        await connectDB();
    }

    // Load plugins
    loadPlugins();

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: config.USE_PAIRING_CODE === 'false',
        browser: Browsers.ubuntu('APEX-MD'),
        auth: state,
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
            return { conversation: 'APEX-MD' };
        }
    });

    // Pairing code support
    if (config.USE_PAIRING_CODE === 'true' && !conn.authState.creds.registered) {
        if (!config.PHONE_NUMBER) {
            console.log('⚠️  PHONE_NUMBER නැහැ! config.env එකේ add කරන්න.');
            process.exit(0);
        }

        setTimeout(async () => {
            const code = await conn.requestPairingCode(config.PHONE_NUMBER);
            console.log('');
            console.log('╔═══════════════════════════════════════════╗');
            console.log(`║    Pairing Code: ${code}                ║`);
            console.log('╚═══════════════════════════════════════════╝');
            console.log('');
            console.log('📱 WhatsApp > Settings > Linked Devices > Link a Device');
            console.log('📱 "Link with phone number instead" option එක select කරන්න');
            console.log(`📱 Code එක enter කරන්න: ${code}`);
            console.log('');
        }, 3000);
    }

    // Bind store
    store?.bind(conn.ev);

    // Connection status
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log('❌ Bad Session File, Please Scan Again');
                fs.unlinkSync(path.join(authFolder, 'creds.json'));
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('⚠️  Connection closed, Reconecting...');
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log('⚠️  Connection lost from server, Reconecting...');
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('❌ Connection Replaced, Another new connection made, Close current one first');
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('👋 Device Logged Out, Please Scan Again!');
                fs.unlinkSync(path.join(authFolder, 'creds.json'));
            } else if (reason === DisconnectReason.restartRequired) {
                console.log('🔄 Restart Required, Restarting...');
                startBot();
            } else if (reason === DisconnectReason.timedOut) {
                console.log('⏱️  Connection TimedOut, Reconecting...');
                startBot();
            } else {
                startBot();
            }
        }

        if (connection === 'connecting') {
            console.log('🔌 Connecting...');
        }

        if (connection === 'open') {
            console.log('');
            console.log('╔═══════════════════════════════════════════╗');
            console.log('║      ✅ BOT CONNECTED SUCCESSFULLY        ║');
            console.log('╚═══════════════════════════════════════════╝');
            console.log('');
            console.log(`👤 Bot Name: ${conn.user.name}`);
            console.log(`📱 Bot Number: ${conn.user.id.split(':')[0]}`);
            console.log('');
        }
    });

    // Creds update
    conn.ev.on('creds.update', saveCreds);

    // ════════════════════════════════════════════════════════════════════
    // MESSAGE HANDLER WITH SPEED MODE V2 SUPPORT (UPDATED)
    // ════════════════════════════════════════════════════════════════════
    conn.ev.on('messages.upsert', async (m) => {
        // Check if message exists
        if (!m.messages) return;

        try {
            const mek = m.messages[0];

            if (!mek.message) return;

            // Serialize message
            const msg = serialize(mek);

            // Get message body
            let body = msg.body;
            const m_reply = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;

            // ════════════════════════════════════════════════════════════════════
            // SPEED MODE V2 - Request Deduplication (NEW)
            // ════════════════════════════════════════════════════════════════════
            if (global.speedMode && global.speedMode.enabled) {
                const requestKey = `${msg.sender}:${body}:${Date.now() % 1000}`;
                if (global.speedMode.isDuplicate(requestKey)) {
                    return; // Skip duplicate request
                }
            }
            // ════════════════════════════════════════════════════════════════════

            if (!body) {
                body = msg.text;
            }

            // Auto read messages
            if (config.AUTO_READ === 'true') {
                conn.readMessages([mek.key]);
            }

            // Auto status view
            if (config.AUTO_STATUS_READ === 'true' && msg.isStatus) {
                await conn.readMessages([mek.key]);
            }

            // Check if group
            const isGroup = msg.from.endsWith('@g.us');
            const sender = msg.from;
            const m_sender = msg.sender;
            const m_reply_obj = m_reply ? Baileys.proto.WebMessageInfo.fromObject({ message: { [Object.keys(m_reply)[0]]: m_reply[Object.keys(m_reply)[0]] } }) : null;

            // Group management
            if (isGroup) {
                const groupMetadata = await conn.groupMetadata(msg.from);
                const participants = groupMetadata.participants;

                msg.isGroup = isGroup;
                msg.groupMetadata = groupMetadata;
                msg.groupMembers = participants;
                msg.isBotAdmin = !!participants.find(p => p.id === conn.user.jid && (p.admin === 'admin' || p.admin === 'superadmin'));
                msg.isAdmin = !!participants.find(p => p.id === m_sender && (p.admin === 'admin' || p.admin === 'superadmin'));
            } else {
                msg.isGroup = false;
            }

            // ============================================
            // ANTILINK SYSTEM
            // ============================================
            if (isGroup && config.ANTILINK_ENABLED === 'true') {
                const group = await getGroup(msg.from);
                
                if (group && group.antilinkEnabled) {
                    const linkPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(wa\.me\/[^\s]+)|(.com|.org|.net|.co|.io)\/[^\s]+/gi;
                    
                    if (linkPattern.test(body)) {
                        if (msg.isAdmin || msg.sender === groupMetadata.owner) {
                            // Admin posted link - allow
                        } else {
                            // Delete message
                            try {
                                await conn.sendMessage(msg.from, { delete: mek.key });
                            } catch (e) {}

                            // Take action
                            if (group.antilinkAction === 'kick') {
                                await conn.groupParticipantsUpdate(msg.from, [m_sender], 'remove');
                                await conn.sendMessage(msg.from, {
                                    text: `🚫 @${m_sender.split('@')[0]} link එකක් යැව්වා හින්දා kick කරන ලදී!`,
                                    mentions: [m_sender]
                                });
                            } else if (group.antilinkAction === 'warn') {
                                await addWarning(m_sender, msg.from, 'Sent a link', conn.user.id);
                                const warnings = await getWarnings(m_sender, msg.from);
                                
                                if (warnings.length >= 3) {
                                    await conn.groupParticipantsUpdate(msg.from, [m_sender], 'remove');
                                    await clearWarnings(m_sender, msg.from);
                                    await conn.sendMessage(msg.from, {
                                        text: `🚫 @${m_sender.split('@')[0]} warnings 3ක් හින්දා kick කරන ලදී!`,
                                        mentions: [m_sender]
                                    });
                                } else {
                                    await conn.sendMessage(msg.from, {
                                        text: `⚠️ @${m_sender.split('@')[0]} warned! Links යවන්න එපා!\nWarnings: ${warnings.length}/3`,
                                        mentions: [m_sender]
                                    });
                                }
                            } else {
                                // Just delete
                                await conn.sendMessage(msg.from, {
                                    text: `❌ @${m_sender.split('@')[0]} links යවන්න බැහැ!`,
                                    mentions: [m_sender]
                                });
                            }
                            
                            return; // Stop processing
                        }
                    }
                }
            }

            // ============================================
            // COMMAND PROCESSING
            // ============================================
            const prefix = config.PREFIX;
            
            if (!body.startsWith(prefix)) return;

            // Get command name
            const args = body.slice(prefix.length).trim().split(/ +/);
            const cmdName = args[0].toLowerCase();
            const text = args.slice(1).join(' ');

            // Find command
            const cmd = handler.findCommand(cmdName);
            if (!cmd) return;

            // Check if user is banned
            const user = await getUser(msg.sender);
            if (user?.banned) {
                if (user.banExpiry && user.banExpiry < new Date()) {
                    // Ban expired, unban
                    await updateUser(msg.sender, { banned: false, banExpiry: null });
                } else {
                    return await conn.sendMessage(msg.from, {
                        text: '❌ ඔබ bot එක use කරන්න ban කරලා තියෙනවා!'
                    }, { quoted: mek });
                }
            }

            // Check permissions
            const isOwner = config.isOwner(msg.sender);
            
            // Owner only commands
            if (cmd.isOwner && !isOwner) {
                return await conn.sendMessage(msg.from, {
                    text: '❌ මේ command එක owner විතරයි use කරන්න පුළුවන්!'
                }, { quoted: mek });
            }

            // Group only commands
            if (cmd.isGroup && !msg.isGroup) {
                return await conn.sendMessage(msg.from, {
                    text: '❌ මේ command එක groups වලයි use කරන්න පුළුවන්!'
                }, { quoted: mek });
            }

            // Private only commands
            if (cmd.isPrivate && msg.isGroup) {
                return await conn.sendMessage(msg.from, {
                    text: '❌ මේ command එක inbox එකේ විතරයි use කරන්න පුළුවන්!'
                }, { quoted: mek });
            }

            // React if configured
            if (cmd.react) {
                await conn.sendMessage(msg.from, {
                    react: { text: cmd.react, key: mek.key }
                });
            }

            // Debug log
            if (config.DEBUG === 'true') {
                console.log(`[CMD] ${msg.sender.split('@')[0]}: ${body}`);
            }

            // ════════════════════════════════════════════════════════════════════
            // SPEED MODE V2 - Check Cache (NEW)
            // ════════════════════════════════════════════════════════════════════
            if (global.speedMode && global.speedMode.enabled) {
                const cacheKey = `${cmdName}:${text}`;
                const cachedResult = global.speedMode.getCachedCommand(cacheKey);
                
                if (cachedResult) {
                    // Return cached result
                    return await conn.sendMessage(msg.from, { text: cachedResult }, { quoted: mek });
                }
            }
            // ════════════════════════════════════════════════════════════════════

            // Execute command
            const extra = {
                conn,
                m: msg,
                mek,
                text,
                args,
                isOwner,
                reply: async (text) => {
                    // ════════════════════════════════════════════════════════════════════
                    // SPEED MODE V2 - Cache Command Response (NEW)
                    // ════════════════════════════════════════════════════════════════════
                    if (global.speedMode && global.speedMode.enabled) {
                        const cacheKey = `${cmdName}:${text}`;
                        global.speedMode.cacheCommand(cacheKey, text);
                    }
                    // ════════════════════════════════════════════════════════════════════
                    
                    return await conn.sendMessage(msg.from, { text }, { quoted: mek });
                },
                react: async (emoji) => {
                    return await conn.sendMessage(msg.from, {
                        react: { text: emoji, key: mek.key }
                    });
                }
            };

            await cmd.function(conn, mek, msg, extra);

            // Log command usage to database
            if (config.MONGODB) {
                const { logCommand } = require('./lib/database');
                await logCommand(cmd.pattern, msg.sender, msg.isGroup ? msg.from : null);
            }

        } catch (e) {
            console.log('❌ Message Handler Error:', e.message);
            if (config.DEBUG === 'true') {
                console.log(e);
            }
        }
    });

    // ════════════════════════════════════════════════════════════════════

    return conn;
}

// Express routes
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>APEX-MD V2 ENHANCED</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        background: rgba(255,255,255,0.1);
                        padding: 40px;
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                    }
                    h1 { font-size: 3em; margin-bottom: 20px; }
                    .status { color: #4ade80; font-weight: bold; font-size: 1.5em; }
                    .version { margin-top: 20px; opacity: 0.8; }
                    .features { margin-top: 30px; text-align: left; }
                    .features li { margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ APEX-MD V2 ENHANCED</h1>
                    <p class="status">Status: Active & Running</p>
                    <p class="version">Version: 2.0.0 Enhanced Edition</p>
                    
                    <div class="features">
                        <h2>🚀 Features:</h2>
                        <ul>
                            <li>📥 Download System (YouTube, TikTok)</li>
                            <li>🤖 AI Integration (Gemini, ChatGPT)</li>
                            <li>👥 Complete Group Management</li>
                            <li>🛡️ Antilink Protection</li>
                            <li>👋 Welcome/Goodbye Messages</li>
                            <li>👑 Owner Control Panel</li>
                            <li>🛠️ Utility Commands</li>
                            <li>💾 Database Integration</li>
                            <li>📊 44+ Commands Total</li>
                            <li>⚡ Speed Mode V2 (Pure Optimization)</li>
                        </ul>
                    </div>
                    
                    <p style="margin-top: 30px;">
                        Created with ❤️ by Shehan Vimukthi<br>
                        Enhanced with AI + Speed Mode V2
                    </p>
                </div>
            </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: '2.0.0',
        enhanced: true,
        speedModeEnabled: global.speedMode?.enabled || false,
        speedModeLevel: global.speedMode?.optimizationLevel || 'disabled'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🌐 Web Server: http://localhost:${PORT}`);
    startBot();
});

// Error handlers
process.on('uncaughtException', (err) => {
    console.log('❌ Uncaught Exception:', err.message);
    if (config.DEBUG === 'true') {
        console.log(err);
    }
});

process.on('unhandledRejection', (err) => {
    console.log('❌ Unhandled Rejection:', err.message);
    if (config.DEBUG === 'true') {
        console.log(err);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('');
    console.log('👋 Bot shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('');
    console.log('👋 Bot shutting down gracefully...');
    process.exit(0);
});
