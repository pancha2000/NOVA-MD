'use strict';

/**
 * ╔════════════════════════════════════════════╗
 * ║          APEX-MD V2  —  index.js           ║
 * ║       Fresh rewrite by Shehan Vimukthi     ║
 * ╚════════════════════════════════════════════╝
 */

// ── Imports ───────────────────────────────────────────────────────────────────
const {
    default:               makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    getContentType,
    downloadMediaMessage,
    isJidBroadcast,
    isJidGroup
} = require('@whiskeysockets/baileys');

const pino    = require('pino');
const fs      = require('fs');
const path    = require('path');
const express = require('express');

const config           = require('./config');
const { cmd, findCmd } = require('./lib/commands');

// ── Silent logger (avoids Baileys noise) ─────────────────────────────────────
const logger = pino({ level: 'silent' });

// ── Folders ───────────────────────────────────────────────────────────────────
const AUTH_DIR = path.join(__dirname, 'auth_info');
const TEMP_DIR = path.join(__dirname, 'temp');
fs.mkdirSync(AUTH_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Express keep-alive (Oracle Cloud firewall ගාන port open ගන්න) ────────────
const app = express();
app.get('/',       (_q, r) => r.send(`✅ ${config.BOT_NAME} is running`));
app.get('/health', (_q, r) => r.json({ ok: true, uptime: process.uptime() }));
app.listen(config.PORT, '0.0.0.0', () =>
    console.log(`🌐 Web  →  http://0.0.0.0:${config.PORT}`)
);

// ── Plugin loader ─────────────────────────────────────────────────────────────
function loadPlugins() {
    const dir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(dir)) { console.log('⚠️  plugins/ folder නැහැ'); return; }

    let ok = 0, fail = 0;
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        try   { require(path.join(dir, f)); ok++;   }
        catch (e) { console.log(`❌ [${f}]`, e.message); fail++; }
    }
    console.log(`📦 Plugins: ${ok} loaded${fail ? `, ${fail} failed` : ''}`);
}

// ── Message body extractor (safe, covers all WhatsApp message types) ──────────
function extractBody(msg) {
    if (!msg) return '';
    return (
        msg.conversation                                                ||
        msg.extendedTextMessage?.text                                   ||
        msg.imageMessage?.caption                                       ||
        msg.videoMessage?.caption                                       ||
        msg.documentMessage?.caption                                    ||
        msg.buttonsResponseMessage?.selectedButtonId                    ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId       ||
        msg.templateButtonReplyMessage?.selectedId                      ||
        msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        ''
    );
}

// ── Serialize incoming message into a clean object ────────────────────────────
async function serialize(raw, conn) {
    // ── Guard: must have key + remoteJid
    if (!raw?.key?.remoteJid) return null;

    const type = getContentType(raw.message);
    if (!type) return null;

    const m       = {};
    m.key         = raw.key;
    m.id          = raw.key.id;
    m.from        = raw.key.remoteJid;
    m.fromMe      = raw.key.fromMe || false;
    m.isGroup     = isJidGroup(m.from);
    m.type        = type;
    m.message     = raw.message;
    m.body        = extractBody(raw.message);
    m.pushName    = raw.pushName || '';

    // ── Sender JID (normalized — removes :0 device suffix)
    m.sender = jidNormalizedUser(
        m.fromMe    ? conn.user.id
        : m.isGroup ? (raw.key.participant || '')
        : m.from
    );

    // ── Group admin status (only fetched for group messages)
    m.isAdmin    = false;
    m.isBotAdmin = false;

    if (m.isGroup) {
        try {
            const meta = await conn.groupMetadata(m.from);
            const botId = jidNormalizedUser(conn.user.id);

            const find = jid => meta.participants.find(
                p => jidNormalizedUser(p.id) === jidNormalizedUser(jid)
            );
            const isAdminRole = p => p?.admin === 'admin' || p?.admin === 'superadmin';

            m.isAdmin    = isAdminRole(find(m.sender));
            m.isBotAdmin = isAdminRole(find(botId));
            m.participants   = meta.participants;
            m.groupMetadata  = meta;
        } catch (_) { /* network issue — skip silently */ }
    }

    // ── Quoted message
    const ctx = raw.message?.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage) {
        const qt = getContentType(ctx.quotedMessage);
        m.quoted = {
            type:    qt,
            sender:  ctx.participant || '',
            text:    ctx.quotedMessage?.[qt]?.text
                  || ctx.quotedMessage?.[qt]?.caption
                  || '',
            message: ctx.quotedMessage,
            download: () => downloadMediaMessage(
                { key: raw.key, message: ctx.quotedMessage }, 'buffer', {}
            )
        };
    } else {
        m.quoted = null;
    }

    m.mentionedJid = raw.message?.[type]?.contextInfo?.mentionedJid || [];

    // ── Helpers
    m.download = () => downloadMediaMessage(raw, 'buffer', {});

    m.react = emoji => conn.sendMessage(m.from, {
        react: { text: emoji, key: raw.key }
    });

    return m;
}

// ── Database (optional) ───────────────────────────────────────────────────────
let db = null;
async function initDB() {
    if (!config.MONGODB) return;
    try {
        const mongoose = require('mongoose');
        await mongoose.connect(config.MONGODB);
        console.log('✅ MongoDB connected');
        db = mongoose;
    } catch (e) {
        console.log('⚠️  MongoDB failed:', e.message);
    }
}

// ── Main bot function ─────────────────────────────────────────────────────────
async function startBot() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       🚀  APEX-MD V2  Starting...        ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    await initDB();
    loadPlugins();

    // Auth state
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version }          = await fetchLatestBaileysVersion();

    console.log('📡 Baileys version:', version.join('.'));

    // Create socket
    const conn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, logger)
        },
        logger,
        printQRInTerminal:            !config.USE_PAIRING_CODE,
        browser:                      Browsers.ubuntu('Chrome'),
        connectTimeoutMs:             60_000,
        defaultQueryTimeoutMs:        0,
        keepAliveIntervalMs:          25_000,
        retryRequestDelayMs:          2_000,
        maxMsgRetryCount:             3,
        fireInitQueries:              true,
        generateHighQualityLinkPreview: true,
        syncFullHistory:              false,
        markOnlineOnConnect:          true,
        getMessage: async () => undefined   // store use කරන්නෑ — memory save
    });

    // ── Save creds whenever they change ──────────────────────────────────────
    conn.ev.on('creds.update', saveCreds);

    // ── Connection state ──────────────────────────────────────────────────────
    conn.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

        if (qr) {
            console.log('');
            console.log('📷 QR code ready — scan with WhatsApp');
            require('qrcode-terminal').generate(qr, { small: true });
        }

        if (connection === 'open') {
            const id = jidNormalizedUser(conn.user.id);
            console.log('');
            console.log('✅ WhatsApp connected!');
            console.log(`   Number : ${id}`);
            console.log(`   Name   : ${conn.user.name || 'N/A'}`);
            console.log('');

            // Pairing code — only request if not yet registered
            if (config.USE_PAIRING_CODE && !conn.authState.creds.registered) {
                if (!config.PHONE_NUMBER) {
                    console.log('⚠️  PHONE_NUMBER config.env ඇතුළේ set කරන්න!');
                    return;
                }
                await new Promise(r => setTimeout(r, 3000));
                try {
                    const code = await conn.requestPairingCode(config.PHONE_NUMBER);
                    console.log('');
                    console.log('╔══════════════════════════════════════════╗');
                    console.log(`║   📱 Pairing Code :  ${code.padEnd(19)}║`);
                    console.log('╚══════════════════════════════════════════╝');
                    console.log('');
                } catch (e) {
                    console.log('❌ Pairing code error:', e.message);
                }
            }
        }

        if (connection === 'close') {
            const statusCode  = lastDisconnect?.error?.output?.statusCode;
            const loggedOut   = statusCode === DisconnectReason.loggedOut;
            const reason      = lastDisconnect?.error?.message || 'Unknown';

            console.log(`🔌 Disconnected — code: ${statusCode}, reason: ${reason}`);

            if (loggedOut) {
                console.log('');
                console.log('⚠️  Logged out!');
                console.log('   auth_info folder delete කරලා restart කරන්න:');
                console.log('   rm -rf auth_info && pm2 restart apex-md-v2');
                console.log('');
            } else {
                // Reconnect with backoff
                const delay = statusCode === 408 ? 10_000 : 5_000;
                console.log(`⏳ Reconnecting in ${delay / 1000}s...`);
                setTimeout(startBot, delay);
            }
        }
    });

    // ── Incoming messages ─────────────────────────────────────────────────────
    conn.ev.on('messages.upsert', async ({ messages, type }) => {

        // ✅ Only real-time messages. 'append' = history sync → skip
        if (type !== 'notify') return;

        for (const raw of messages) {
            try {
                // Skip: no content, status broadcast
                if (!raw?.message)                     continue;
                if (!raw?.key?.remoteJid)              continue;
                if (isJidBroadcast(raw.key.remoteJid)) continue;

                const m = await serialize(raw, conn);
                if (!m) continue;

                // Auto read
                if (config.AUTO_READ) {
                    await conn.readMessages([raw.key]).catch(() => {});
                }

                // ✅ Skip own messages — normalized compare
                if (jidNormalizedUser(m.sender) === jidNormalizedUser(conn.user.id)) continue;

                // ── Command matching ──────────────────────────────────────────
                const prefix = config.PREFIX;
                if (!m.body.startsWith(prefix)) continue;

                const parts   = m.body.slice(prefix.length).trim().split(/\s+/);
                const cmdName = parts.shift().toLowerCase();
                const text    = parts.join(' ');
                const args    = parts;

                const command = findCmd(cmdName);
                if (!command) continue;

                // Permission checks
                const isOwner = config.isOwner(m.sender);

                if (command.isOwner && !isOwner) {
                    await conn.sendMessage(m.from,
                        { text: '❌ Owner only command!' }, { quoted: raw }
                    );
                    continue;
                }

                if (command.isGroup && !m.isGroup) {
                    await conn.sendMessage(m.from,
                        { text: '❌ Group only command!' }, { quoted: raw }
                    );
                    continue;
                }

                if (command.isPrivate && m.isGroup) {
                    await conn.sendMessage(m.from,
                        { text: '❌ Private chat only command!' }, { quoted: raw }
                    );
                    continue;
                }

                // React
                if (command.react) {
                    conn.sendMessage(m.from, {
                        react: { text: command.react, key: raw.key }
                    }).catch(() => {});
                }

                // Extra helpers passed to every plugin
                const extra = {
                    conn, m, mek: raw,
                    text, args, isOwner,
                    reply: txt  => conn.sendMessage(m.from, { text: String(txt) }, { quoted: raw }),
                    react: emoji => conn.sendMessage(m.from, { react: { text: emoji, key: raw.key } })
                };

                // Run command
                await command.function(conn, raw, m, extra);

            } catch (e) {
                // Bad MAC / decrypt errors — silently skip, never crash
                const msg = e?.message || '';
                if (msg.includes('Bad MAC') || msg.includes('decrypt') || msg.includes('Signal')) {
                    continue;
                }
                console.log('⚠️  Handler error:', msg);
            }
        }
    });

    return conn;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
startBot().catch(e => {
    console.log('❌ Boot error:', e.message);
    setTimeout(startBot, 10_000);
});

// ── Crash guards ──────────────────────────────────────────────────────────────
process.on('uncaughtException',  e => console.log('⚠️  uncaughtException:',  e.message));
process.on('unhandledRejection', e => console.log('⚠️  unhandledRejection:', e?.message || e));
process.on('SIGINT',  () => { console.log('\n👋 Stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Stopped.'); process.exit(0); });
