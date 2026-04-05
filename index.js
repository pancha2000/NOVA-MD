/**
 * ╔═══════════════════════════════════════════╗
 * ║        APEX-MD V2 - Clean Rewrite        ║
 * ║        Created by: Shehan Vimukthi       ║
 * ╚═══════════════════════════════════════════╝
 */

'use strict';

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    jidNormalizedUser,
    getContentType,
    downloadMediaMessage,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino        = require('pino');
const fs          = require('fs');
const path        = require('path');
const express     = require('express');
const config      = require('./config');
const { connectDB, getUser, logCommand } = require('./lib/database');
const { handler } = require('./lib/commands');

// ── Logger ──────────────────────────────────────────────────────────────────
const logger = pino({ level: 'silent' });

// ── Express (keep-alive) ────────────────────────────────────────────────────
const app = express();
app.get('/',       (_req, res) => res.send('✅ APEX-MD V2 is running'));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(config.PORT || 8000, '0.0.0.0', () =>
    console.log(`🌐 Web server: http://localhost:${config.PORT || 8000}`)
);

// ── Auth & Temp folders ──────────────────────────────────────────────────────
const AUTH_DIR = path.join(__dirname, 'auth_info');
const TEMP_DIR = path.join(__dirname, 'temp');
[AUTH_DIR, TEMP_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Plugin loader ────────────────────────────────────────────────────────────
function loadPlugins() {
    const dir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(dir)) return console.log('⚠️  plugins/ folder නැහැ');

    let ok = 0, fail = 0;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            require(path.join(dir, file));
            ok++;
        } catch (e) {
            console.log(`❌ Plugin error [${file}]: ${e.message}`);
            fail++;
        }
    }
    console.log(`✅ Plugins: ${ok} loaded${fail ? `, ${fail} failed` : ''}`);
}

// ── Serialize ────────────────────────────────────────────────────────────────
async function serialize(msg, conn) {
    if (!msg?.key?.remoteJid) return null;

    const type = getContentType(msg.message);
    if (!type) return null;

    const m = {};
    m.key      = msg.key;
    m.from     = msg.key.remoteJid;
    m.fromMe   = msg.key.fromMe || false;
    m.id       = msg.key.id;
    m.isGroup  = m.from.endsWith('@g.us');
    m.type     = type;
    m.message  = msg.message;

    // sender
    m.sender = jidNormalizedUser(
        m.fromMe       ? conn.user.id
        : m.isGroup    ? (msg.key.participant || '')
        : m.from
    );

    // body — safe extraction
    const raw = msg.message;
    m.body =
        raw?.conversation                                          ||
        raw?.extendedTextMessage?.text                            ||
        raw?.imageMessage?.caption                                ||
        raw?.videoMessage?.caption                                ||
        raw?.buttonsResponseMessage?.selectedButtonId             ||
        raw?.listResponseMessage?.singleSelectReply?.selectedRowId||
        raw?.templateButtonReplyMessage?.selectedId               ||
        '';

    // group admin info
    m.isAdmin    = false;
    m.isBotAdmin = false;

    if (m.isGroup) {
        try {
            const meta         = await conn.groupMetadata(m.from);
            const participants = meta.participants || [];
            const botId        = jidNormalizedUser(conn.user.id);

            const senderP = participants.find(p => jidNormalizedUser(p.id) === jidNormalizedUser(m.sender));
            const botP    = participants.find(p => jidNormalizedUser(p.id) === botId);

            m.isAdmin    = senderP?.admin === 'admin' || senderP?.admin === 'superadmin';
            m.isBotAdmin = botP?.admin    === 'admin' || botP?.admin    === 'superadmin';
            m.groupMetadata = meta;
            m.participants  = participants;
        } catch (_) { /* silently skip */ }
    }

    // quoted
    const ctx = raw?.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage) {
        const qt  = getContentType(ctx.quotedMessage);
        m.quoted  = {
            type:   qt,
            sender: ctx.participant || '',
            text:   ctx.quotedMessage?.[qt]?.text || ctx.quotedMessage?.[qt]?.caption || '',
            message: ctx.quotedMessage
        };
    } else {
        m.quoted = null;
    }

    m.mentionedJid = raw?.[type]?.contextInfo?.mentionedJid || [];

    m.download = () => downloadMediaMessage(msg, 'buffer', {});

    m.react = emoji => conn.sendMessage(m.from, { react: { text: emoji, key: msg.key } });

    return m;
}

// ── Bot ──────────────────────────────────────────────────────────────────────
async function startBot() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║      🚀 APEX-MD V2 Starting...          ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // DB
    if (config.MONGODB) {
        try { await connectDB(); }
        catch (e) { console.log('⚠️  MongoDB connect failed:', e.message); }
    }

    // Plugins
    loadPlugins();

    // Auth
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version }          = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, logger)
        },
        logger,
        printQRInTerminal: config.USE_PAIRING_CODE !== 'true',
        browser: Browsers.ubuntu('APEX-MD'),
        connectTimeoutMs:      60_000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs:   25_000,
        markOnlineOnConnect:   true,
        generateHighQualityLinkPreview: true,
        getMessage: async () => ({ conversation: 'APEX-MD' })
    });

    // ── Credentials save ──
    conn.ev.on('creds.update', saveCreds);

    // ── Connection state ──
    conn.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('📷 QR Ready — scan with WhatsApp');
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp connected!');
            console.log('   Bot:', conn.user.id);

            // Pairing code
            if (config.USE_PAIRING_CODE === 'true' && !conn.authState.creds.registered) {
                if (!config.PHONE_NUMBER) {
                    console.log('⚠️  PHONE_NUMBER config.env ඇතුළේ set කරන්න!');
                } else {
                    await new Promise(r => setTimeout(r, 3000));
                    try {
                        const code = await conn.requestPairingCode(config.PHONE_NUMBER);
                        console.log('\n╔══════════════════════════════════════════╗');
                        console.log(`║   📱 Pairing Code: ${code.padEnd(20)}║`);
                        console.log('╚══════════════════════════════════════════╝\n');
                    } catch (e) {
                        console.log('❌ Pairing code error:', e.message);
                    }
                }
            }
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = code === DisconnectReason.loggedOut;

            console.log(`🔌 Connection closed (code: ${code}) — ${loggedOut ? 'Logged out' : 'Reconnecting...'}`);

            if (!loggedOut) {
                setTimeout(startBot, 5000);
            } else {
                console.log('⚠️  Logged out. auth_info delete කරලා restart කරන්න.');
            }
        }
    });

    // ── Messages ────────────────────────────────────────────────────────────
    conn.ev.on('messages.upsert', async ({ messages, type }) => {

        // ✅ FIX 1: Only process real incoming messages
        if (type !== 'notify') return;

        for (const mek of messages) {
            try {
                // Skip empty / no message
                if (!mek?.message || !mek?.key?.remoteJid) continue;

                // Skip status broadcast
                if (mek.key.remoteJid === 'status@broadcast') continue;

                const m = await serialize(mek, conn);
                if (!m) continue;

                const body = m.body;

                // Auto read
                if (config.AUTO_READ === 'true') {
                    await conn.readMessages([mek.key]).catch(() => {});
                }

                // ✅ FIX 2: Proper JID comparison to ignore own messages
                if (jidNormalizedUser(m.sender) === jidNormalizedUser(conn.user.id)) continue;

                // ── Command processing ──────────────────────────────────────
                const prefix = config.PREFIX || '.';
                if (!body || !body.startsWith(prefix)) continue;

                const args    = body.slice(prefix.length).trim().split(/\s+/);
                const cmdName = args.shift().toLowerCase();
                const text    = args.join(' ');

                const cmd = handler.findCommand(cmdName);
                if (!cmd) continue;

                // Owner check
                const isOwner = config.isOwner(m.sender);
                if (cmd.isOwner && !isOwner) {
                    await conn.sendMessage(m.from, {
                        text: '❌ මේ command owner විතරයි use කරන්න පුළුවන්!'
                    }, { quoted: mek });
                    continue;
                }

                // Group-only check
                if (cmd.isGroup && !m.isGroup) {
                    await conn.sendMessage(m.from, {
                        text: '❌ මේ command groups ඇතුළේ විතරයි!'
                    }, { quoted: mek });
                    continue;
                }

                // Private-only check
                if (cmd.isPrivate && m.isGroup) {
                    await conn.sendMessage(m.from, {
                        text: '❌ මේ command inbox ඇතුළේ විතරයි!'
                    }, { quoted: mek });
                    continue;
                }

                // React
                if (cmd.react) {
                    await conn.sendMessage(m.from, {
                        react: { text: cmd.react, key: mek.key }
                    }).catch(() => {});
                }

                // Extra helpers
                const extra = {
                    conn, m, mek, text, args, isOwner,
                    reply: (txt) => conn.sendMessage(m.from, { text: String(txt) }, { quoted: mek }),
                    react: (emoji) => conn.sendMessage(m.from, { react: { text: emoji, key: mek.key } })
                };

                // Execute
                await cmd.function(conn, mek, m, extra);

                // Log to DB
                if (config.MONGODB) {
                    logCommand(cmd.pattern, m.sender, m.isGroup ? m.from : null).catch(() => {});
                }

            } catch (e) {
                // Bad MAC / decrypt errors — skip silently, don't spam owner
                if (e.message?.includes('Bad MAC') || e.message?.includes('decrypt')) {
                    continue;
                }
                console.log('❌ Message handler error:', e.message);
            }
        }
    });

    return conn;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
startBot().catch(e => {
    console.log('❌ Startup error:', e.message);
    setTimeout(startBot, 10_000);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT',  () => { console.log('\n👋 Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Shutting down...'); process.exit(0); });
process.on('uncaughtException',  e => console.log('⚠️  Uncaught:', e.message));
process.on('unhandledRejection', e => console.log('⚠️  Unhandled:', e?.message || e));
