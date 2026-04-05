/**
 * ╔═══════════════════════════════════════════╗
 * ║        NOVA-MD  WhatsApp Bot              ║
 * ║   Mega Session | Plugin Architecture      ║
 * ╚═══════════════════════════════════════════╝
 */

const Baileys = require('@whiskeysockets/baileys');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = Baileys;

const makeInMemoryStore = Baileys.makeInMemoryStore || null;

const pino   = require('pino');
const fs     = require('fs');
const path   = require('path');
const express = require('express');
const { File } = require('megajs');

const config = require('./config');
const { connectDB }     = require('./lib/database');
const { handler }       = require('./lib/commands');
const { serialize }     = require('./lib/functions');
const {
    setupGlobalErrorHandlers,
    sendErrorToOwner,
    sendStartupNotification,
    withErrorHandler
} = require('./lib/errorHandler');

// ── Express ───────────────────────────────────────────────────────────────────
const app  = express();
const PORT = config.PORT || 8000;

// ── Store ────────────────────────────────────────────────────────────────────
let store = null;
if (makeInMemoryStore && typeof makeInMemoryStore === 'function') {
    try {
        store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
        console.log('✅ Message store enabled');
    } catch (e) {
        console.log('⚠️  Store init failed:', e.message);
    }
}

// ── Folders ───────────────────────────────────────────────────────────────────
const authFolder = path.join(__dirname, 'auth_info');
const tmpFolder  = path.join(__dirname, 'tmp');
[authFolder, tmpFolder].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Load Plugins ──────────────────────────────────────────────────────────────
const loadPlugins = withErrorHandler('Plugin Loader')(function () {
    const pluginDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginDir)) {
        console.log('⚠️  Plugins folder නැහැ!');
        return;
    }
    let ok = 0, fail = 0;
    fs.readdirSync(pluginDir)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            try {
                require(path.join(pluginDir, file));
                ok++;
            } catch (e) {
                console.log(`❌ Plugin [${file}]:`, e.message);
                fail++;
            }
        });
    console.log(`✅ Plugins loaded: ${ok}${fail ? `  ❌ failed: ${fail}` : ''}`);
});

// ── Download Session from Mega ────────────────────────────────────────────────
const downloadSession = withErrorHandler('Session Download')(async function () {
    if (!config.SESSION_ID) {
        console.log('⚠️  SESSION_ID නැහැ config.env!');
        return false;
    }

    const credsPath = path.join(authFolder, 'creds.json');
    if (fs.existsSync(credsPath)) {
        console.log('✅ Session දැනටමත් තියනවා');
        return true;
    }

    console.log('📥 Mega.nz ඉදල session download කරනවා...');

    // Strip any custom prefix  (NOVA~, APEX~, etc.)
    let sessionUrl = config.SESSION_ID.trim().replace(/^[A-Z0-9_-]+~/i, '');

    if (!sessionUrl.includes('mega.nz')) {
        sessionUrl = `https://mega.nz/file/${sessionUrl}`;
    }

    console.log('🔗 Mega link:', sessionUrl);

    const file = File.fromURL(sessionUrl);
    await file.loadAttributes();

    const data = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Download timeout (60s)')), 60000);
        file.download((err, buf) => {
            clearTimeout(timer);
            if (err) reject(err); else resolve(buf);
        });
    });

    fs.writeFileSync(credsPath, data);
    console.log('✅ Session download සාර්ථකයි!');
    return true;
});

// ── Bot Core ──────────────────────────────────────────────────────────────────
async function startBot() {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║         🚀 NOVA-MD  Starting...          ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');

    let conn = null;

    try {
        if (config.SESSION_ID) await downloadSession();
        if (config.MONGODB)    await connectDB();
        loadPlugins();

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version }          = await fetchLatestBaileysVersion();

        conn = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: config.USE_PAIRING_CODE !== 'true',
            browser: Browsers.ubuntu('NOVA-MD'),
            auth: state,
            getMessage: async (key) => {
                try {
                    if (!key?.remoteJid) return undefined;
                    if (store) return (await store.loadMessage(key.remoteJid, key.id))?.message || undefined;
                    return { conversation: 'NOVA-MD' };
                } catch { return undefined; }
            }
        });

        setupGlobalErrorHandlers(conn);
        store?.bind(conn.ev);
        conn.ev.on('creds.update', saveCreds);

        // Pairing code
        if (config.USE_PAIRING_CODE === 'true' && !conn.authState.creds.registered) {
            if (!config.PHONE_NUMBER) {
                console.log('⚠️  PHONE_NUMBER නැහැ config.env!');
                process.exit(0);
            }
            setTimeout(async () => {
                try {
                    const code = await conn.requestPairingCode(config.PHONE_NUMBER);
                    console.log('');
                    console.log('╔═══════════════════════════════════════════╗');
                    console.log(`║  📱 Pairing Code: ${code.padEnd(24)}║`);
                    console.log('╚═══════════════════════════════════════════╝');
                    console.log('');
                } catch (e) {
                    await sendErrorToOwner(conn, e, 'Pairing Code');
                }
            }, 3000);
        }

        // Connection events
        conn.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                console.log('✅ NOVA-MD connected!');
                await sendStartupNotification(conn);
            }
            if (connection === 'close') {
                const shouldReconnect =
                    lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('🔴 Connection closed. Reconnect:', shouldReconnect);
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 3000);
                } else {
                    await sendErrorToOwner(conn, new Error('Bot logged out!'), 'Connection');
                }
            }
        });

        // Message handler
        conn.ev.on('messages.upsert', async ({ messages }) => {
            try {
                if (!messages?.length) return;
                const mek = messages[0];
                if (!mek?.message?.conversation && !mek?.message?.extendedTextMessage &&
                    !mek?.message?.imageMessage && !mek?.message?.videoMessage) return;
                if (!mek.key?.remoteJid) return;

                const m = await serialize(mek, conn);
                if (!m) return;

                // Auto read
                if (config.AUTO_READ === 'true') await conn.readMessages([mek.key]);

                // Status broadcast
                if (m.from === 'status@broadcast') {
                    if (config.AUTO_STATUS_READ === 'true') await conn.readMessages([mek.key]);
                    return;
                }

                // Skip own messages
                if (m.sender === conn.user.id) return;

                // Typing indicator
                if (config.AUTO_TYPING === 'true')
                    await conn.sendPresenceUpdate('composing', m.from);

                // ── Command dispatch ──────────────────────────────────────────
                const body = m.body || '';
                if (!body.startsWith(config.PREFIX)) return;

                const args    = body.slice(config.PREFIX.length).trim().split(/ +/);
                const cmdName = args[0].toLowerCase();
                const text    = args.slice(1).join(' ');
                const cmd     = handler.findCommand(cmdName);
                if (!cmd) return;

                // Permission checks
                const isOwner = config.isOwner(m.sender);

                if (cmd.isOwner && !isOwner)
                    return conn.sendMessage(m.from,
                        { text: '❌ Owner විතරයි use කරන්න පුළුවන්!' }, { quoted: mek });

                if (cmd.isGroup && !m.isGroup)
                    return conn.sendMessage(m.from,
                        { text: '❌ Group commands inbox ද්දී use කරන්න බැහැ!' }, { quoted: mek });

                if (cmd.isPrivate && m.isGroup)
                    return conn.sendMessage(m.from,
                        { text: '❌ Inbox එකේ විතරයි use කරන්න!' }, { quoted: mek });

                if (cmd.react)
                    await conn.sendMessage(m.from,
                        { react: { text: cmd.react, key: mek.key } });

                if (config.DEBUG === 'true')
                    console.log(`[CMD] ${m.sender.split('@')[0]}: ${body}`);

                // Execute
                try {
                    await cmd.function(conn, mek, m, {
                        conn, m, text, args, isOwner,
                        from: m.from,
                        q: text,
                        reply: async (txt) => conn.sendMessage(m.from, { text: String(txt) }, { quoted: mek }),
                        react: async (emoji) => conn.sendMessage(m.from, { react: { text: emoji, key: mek.key } })
                    });

                    if (config.MONGODB) {
                        const { logCommand } = require('./lib/database');
                        await logCommand(cmd.pattern, m.sender, m.isGroup ? m.from : null);
                    }
                } catch (cmdErr) {
                    console.log(`❌ CMD [${cmd.pattern}]:`, cmdErr.message);
                    await sendErrorToOwner(conn, cmdErr, `Command: ${cmd.pattern}`);
                    await conn.sendMessage(m.from,
                        { text: `❌ Error: ${cmdErr.message}` }, { quoted: mek });
                }

            } catch (e) {
                if (e.message?.includes('remoteJid')) return; // ignore noise
                console.log('❌ Message handler error:', e.message);
                if (conn) await sendErrorToOwner(conn, e, 'Message Handler');
            }
        });

        // Group participant events (welcome/goodbye)
        conn.ev.on('group-participants.update', async ({ id, participants, action }) => {
            try {
                const { getGroup } = require('./lib/database');
                const group = await getGroup(id);
                if (!group) return;

                const meta = await conn.groupMetadata(id);

                if (action === 'add' && group.welcome) {
                    for (const p of participants) {
                        let msg = (group.welcomeMessage || '👋 Welcome @user to @group!')
                            .replace('@user', `@${p.split('@')[0]}`)
                            .replace('@group', meta.subject);
                        await conn.sendMessage(id, { text: msg, mentions: [p] });
                    }
                }

                if (action === 'remove' && group.goodbye) {
                    for (const p of participants) {
                        let msg = (group.goodbyeMessage || '👋 Goodbye @user!')
                            .replace('@user', `@${p.split('@')[0]}`);
                        await conn.sendMessage(id, { text: msg });
                    }
                }
            } catch (e) {
                console.log('Group event error:', e.message);
            }
        });

        return conn;

    } catch (e) {
        console.log('❌ Startup Error:', e.message);
        if (conn) await sendErrorToOwner(conn, e, 'Startup');
        console.log('⏳ Retrying in 10s...');
        setTimeout(() => startBot(), 10000);
    }
}

// ── Web server ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send(`
<html><head><title>NOVA-MD</title>
<style>
  body{font-family:Arial,sans-serif;text-align:center;padding:50px;
    background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);color:#fff;}
  .box{background:rgba(255,255,255,.08);padding:40px;border-radius:20px;
    backdrop-filter:blur(10px);display:inline-block;}
  h1{font-size:2.5em;} .ok{color:#4ade80;font-size:1.3em;font-weight:bold;}
</style></head><body>
<div class="box">
  <h1>🤖 NOVA-MD</h1>
  <p class="ok">✅ Active & Running</p>
  <p style="margin-top:20px;opacity:.7">WhatsApp Bot — Mega Session | Plugin System</p>
</div></body></html>
`));

app.get('/health', (_req, res) => res.json({
    status: 'ok', uptime: process.uptime(), version: '1.0.0'
}));

app.listen(PORT, () => {
    console.log(`🌐 Web server: http://localhost:${PORT}`);
    startBot();
});

process.on('SIGINT',  () => { console.log('\n👋 Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Shutting down...'); process.exit(0); });
