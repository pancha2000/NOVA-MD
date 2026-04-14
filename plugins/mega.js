'use strict';

/**
 * ╔══════════════════════════════════════╗
 * ║   NOVA-MD — Mega.nz Plugin          ║
 * ║   .megadl  → Mega.nz download       ║
 * ║   .megaup  → Mega.nz upload         ║
 * ╚══════════════════════════════════════╝
 *
 * Upload setup:
 *  config.env එකේ set කරන්න:
 *    MEGA_EMAIL=your@email.com
 *    MEGA_PASSWORD=yourpassword
 */

const { cmd }         = require('../lib/commands');
const config          = require('../config');
const { File, Storage } = require('megajs');

const MAX_SIZE_MB = 100;

// ── Helper: MIME type from filename ──────────────────────────────────────────
function getMimeType(filename) {
    const ext = (filename || '').split('.').pop()?.toLowerCase();
    const map = {
        mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp',
        pdf: 'application/pdf', zip: 'application/zip',
        rar: 'application/x-rar-compressed',
        apk: 'application/vnd.android.package-archive',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain', json: 'application/json',
    };
    return map[ext] || 'application/octet-stream';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .megadl — Mega.nz Download
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'megadl',
    alias:    ['megadown', 'mdown', 'megafile'],
    desc:     'Mega.nz file download කරන්න',
    category: 'download',
    use:      '.megadl <mega.nz url>',
    react:    '🔻'
}, async (conn, mek, m, { reply, text }) => {
    if (!text) return reply(
        '📎 *Usage:* .megadl <Mega.nz URL>\n\n' +
        '*Example:*\n.megadl https://mega.nz/file/XXXXXXXX#KEY'
    );

    const url = text.trim();
    if (!url.includes('mega.nz') && !url.includes('mega.co.nz')) {
        return reply('❌ Valid Mega.nz link එකක් දෙන්න!\n\nFormat: https://mega.nz/file/XXXXXXXX#KEY');
    }

    await reply('🔻 Mega.nz link load කරනවා...');

    try {
        const file = File.fromURL(url);
        await file.loadAttributes();

        const name   = file.name || `mega_${Date.now()}`;
        const sizeMB = (file.size || 0) / 1024 / 1024;

        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            return reply(`❌ File size (${sizeMB.toFixed(1)} MB) limit exceed කරලා! Max: ${MAX_SIZE_MB} MB`);
        }

        await reply(`📥 Downloading: *${name}*\n📦 Size: ${sizeMB.toFixed(2)} MB\n⏳ Please wait...`);

        // Download with timeout
        const buffer = await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Download timeout — 120s exceeded')),
                120000
            );
            file.download((err, buf) => {
                clearTimeout(timer);
                if (err) reject(err); else resolve(buf);
            });
        });

        const mimeType = getMimeType(name);

        // Send as document so filename is preserved
        await conn.sendMessage(m.from, {
            document: buffer,
            fileName: name,
            mimetype: mimeType,
            caption:
                `✅ *Mega.nz Download සාර්ථකයි!*\n\n` +
                `📁 *File :* ${name}\n` +
                `📦 *Size :* ${sizeMB.toFixed(2)} MB`
        }, { quoted: mek });

    } catch (e) {
        console.log('Mega download error:', e.message);
        await reply(`❌ Mega Download Error: ${e.message}`);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .megaup — Mega.nz Upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'megaup',
    alias:    ['megaupload', 'megasave', 'mup'],
    desc:     'Mega.nz upload කරන්න (file එකට reply කරන්න)',
    category: 'upload',
    use:      '.megaup (reply to any file/image/video)',
    react:    '📤'
}, async (conn, mek, m, { reply }) => {
    // Credentials check
    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD) {
        return reply(
            '❌ *Mega.nz credentials නැහැ!*\n\n' +
            'config.env එකේ add කරන්න:\n' +
            '```\nMEGA_EMAIL=your@email.com\nMEGA_PASSWORD=yourpassword\n```'
        );
    }

    const MEDIA_TYPES = ['imageMessage','videoMessage','documentMessage','audioMessage'];
    const type        = m.type;
    const quotedType  = m.quoted ? Object.keys(m.quoted)[0] : null;
    const hasMedia    = MEDIA_TYPES.includes(type);
    const hasQuoted   = quotedType && MEDIA_TYPES.includes(quotedType);

    if (!hasMedia && !hasQuoted) {
        return reply('📎 File/Image/Video/Audio එකට reply කරලා `.megaup` ලියන්න!');
    }

    await reply('☁️ Mega.nz upload prepare කරනවා...');

    let storage = null;

    try {
        // Determine which message to download
        let dlMsg    = mek;
        let dlType   = type;
        let fileName = `nova_upload_${Date.now()}`;
        let mimeType = 'application/octet-stream';

        if (!hasMedia && hasQuoted) {
            const ctx = mek.message[type]?.contextInfo;
            dlMsg  = {
                key:     { remoteJid: m.from, id: ctx?.stanzaId, participant: ctx?.participant },
                message: ctx?.quotedMessage
            };
            dlType = quotedType;
        }

        const mediaMsg = dlMsg.message?.[dlType] || mek.message?.[dlType];
        if (mediaMsg) {
            mimeType = mediaMsg.mimetype || mimeType;
            fileName = mediaMsg.fileName ||
                       `${dlType.replace('Message', '')}_${Date.now()}`;
        }

        // Download from WhatsApp
        const buffer  = await conn.downloadMediaMessage(dlMsg);
        const sizeMB  = buffer.length / 1024 / 1024;

        if (sizeMB > MAX_SIZE_MB) {
            return reply(`❌ File size (${sizeMB.toFixed(1)} MB) limit exceed කරලා! Max: ${MAX_SIZE_MB} MB`);
        }

        await reply(`📤 Uploading to Mega.nz: *${fileName}* (${sizeMB.toFixed(2)} MB)...\n⏳ Please wait...`);

        // Login to Mega.nz
        storage = new Storage({
            email:    config.MEGA_EMAIL,
            password: config.MEGA_PASSWORD
        });

        // Wait for storage to be ready (with timeout)
        await Promise.race([
            storage.ready,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Mega login timeout — 30s exceeded')), 30000)
            )
        ]);

        // Upload file
        const uploadStream  = storage.upload({ name: fileName, size: buffer.length });
        const uploadPromise = uploadStream.complete;
        uploadStream.end(buffer);
        const uploadedFile = await uploadPromise;

        // Get shareable link
        const link = await uploadedFile.link();

        storage.close();
        storage = null;

        await reply(
            `✅ *Mega.nz Upload සාර්ථකයි!*\n\n` +
            `📁 *File  :* ${fileName}\n` +
            `📦 *Size  :* ${sizeMB.toFixed(2)} MB\n` +
            `🔗 *Link  :* ${link}`
        );

    } catch (e) {
        if (storage) { try { storage.close(); } catch (_) {} }
        console.log('Mega upload error:', e.message);
        await reply(`❌ Mega Upload Error: ${e.message}`);
    }
});
