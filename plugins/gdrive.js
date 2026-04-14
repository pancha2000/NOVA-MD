'use strict';

/**
 * ╔══════════════════════════════════════╗
 * ║   NOVA-MD — Google Drive Plugin     ║
 * ║   .gdl   → Download from GDrive     ║
 * ║   .gdup  → Upload to GDrive         ║
 * ╚══════════════════════════════════════╝
 *
 * Setup:
 *  1. https://console.cloud.google.com → New project → Enable "Google Drive API"
 *  2. Credentials → OAuth 2.0 Client ID (Desktop App) → Copy Client ID & Secret
 *  3. https://developers.google.com/oauthplayground →
 *       Settings ⚙ → tick "Use your own OAuth credentials" → paste Client ID & Secret
 *       Scope: https://www.googleapis.com/auth/drive
 *       Authorize → Exchange for refresh token → Copy Refresh Token
 *  4. config.env එකේ GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN set කරන්න
 */

const { cmd }  = require('../lib/commands');
const config   = require('../config');
const axios    = require('axios');

const MAX_SIZE_MB = 100;

// ── Helper: Extract Google Drive File ID ─────────────────────────────────────
function extractGDriveId(url) {
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]+)/,
        /open\?id=([a-zA-Z0-9_-]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

// ── Helper: Get OAuth2 Access Token from Refresh Token ───────────────────────
async function getAccessToken() {
    const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = config;
    if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
        throw new Error(
            'Google Drive credentials නැහැ!\n\n' +
            'config.env එකේ set කරන්න:\n' +
            'GDRIVE_CLIENT_ID=\nGDRIVE_CLIENT_SECRET=\nGDRIVE_REFRESH_TOKEN='
        );
    }
    const res = await axios.post('https://oauth2.googleapis.com/token', {
        client_id:     GDRIVE_CLIENT_ID,
        client_secret: GDRIVE_CLIENT_SECRET,
        refresh_token: GDRIVE_REFRESH_TOKEN,
        grant_type:    'refresh_token'
    });
    return res.data.access_token;
}

// ── Helper: Get MIME type ─────────────────────────────────────────────────────
function getMimeType(filename) {
    const ext = (filename || '').split('.').pop()?.toLowerCase();
    const map = {
        mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp',
        pdf: 'application/pdf', zip: 'application/zip',
        apk: 'application/vnd.android.package-archive',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain', json: 'application/json',
    };
    return map[ext] || 'application/octet-stream';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .gdl — Google Drive Download
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'gdl',
    alias:    ['gdrive', 'gdrivedown', 'gd'],
    desc:     'Google Drive file download කරන්න',
    category: 'download',
    use:      '.gdl <google drive url>',
    react:    '☁️'
}, async (conn, mek, m, { reply, text }) => {
    if (!text) return reply(
        '📎 *Usage:* .gdl <Google Drive URL>\n\n' +
        '*Example:*\n.gdl https://drive.google.com/file/d/FILE_ID/view'
    );

    const fileId = extractGDriveId(text.trim());
    if (!fileId) return reply(
        '❌ Valid Google Drive link එකක් දෙන්න!\n\n' +
        '*Supported formats:*\n' +
        '• https://drive.google.com/file/d/ID/view\n' +
        '• https://drive.google.com/open?id=ID'
    );

    await reply('☁️ Google Drive ඉදල download කරනවා...');

    try {
        // Direct download URL (confirm=t bypasses large file warning)
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

        const res = await axios({
            method:       'GET',
            url:          downloadUrl,
            responseType: 'arraybuffer',
            maxRedirects: 10,
            timeout:      120000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        let buffer      = Buffer.from(res.data);
        let contentType = res.headers['content-type'] || 'application/octet-stream';

        // Large files return an HTML confirmation page — handle it
        if (contentType.includes('text/html')) {
            const html  = buffer.toString('utf-8');
            // Try to find the real confirm token from the virus scan warning page
            const match = html.match(/confirm=([0-9A-Za-z_]+)/) ||
                          html.match(/&amp;confirm=([0-9A-Za-z_]+)/);
            if (match) {
                const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${match[1]}`;
                const r2 = await axios({
                    method: 'GET', url: confirmUrl,
                    responseType: 'arraybuffer', maxRedirects: 10, timeout: 120000
                });
                buffer      = Buffer.from(r2.data);
                contentType = r2.headers['content-type'] || 'application/octet-stream';
            } else {
                return reply('❌ File public නැහැ හෝ download restrict කර තියෙනවා!\nFile sharing settings check කරන්න.');
            }
        }

        const sizeMB = buffer.length / 1024 / 1024;
        if (sizeMB > MAX_SIZE_MB) {
            return reply(`❌ File size (${sizeMB.toFixed(1)} MB) limit exceed කරලා! Max: ${MAX_SIZE_MB} MB`);
        }

        // Extract filename from Content-Disposition header
        let fileName = `gdrive_${fileId}`;
        const disp   = res.headers['content-disposition'] || '';
        const nm     = disp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (nm) fileName = nm[1].replace(/['"]/g, '').trim() || fileName;

        await conn.sendMessage(m.from, {
            document: buffer,
            fileName: fileName,
            mimetype: contentType.split(';')[0].trim(),
            caption:
                `✅ *Google Drive Download සාර්ථකයි!*\n\n` +
                `📁 *File :* ${fileName}\n` +
                `📦 *Size :* ${sizeMB.toFixed(2)} MB`
        }, { quoted: mek });

    } catch (e) {
        console.log('GDrive download error:', e.message);
        await reply(`❌ Download Error: ${e.message}`);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .gdup — Google Drive Upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'gdup',
    alias:    ['gdriveup', 'gdriveupload', 'gupload'],
    desc:     'Google Drive upload කරන්න (file එකට reply කරන්න)',
    category: 'upload',
    use:      '.gdup (reply to any file/image/video)',
    react:    '📤'
}, async (conn, mek, m, { reply }) => {
    // Credentials check
    if (!config.GDRIVE_CLIENT_ID || !config.GDRIVE_REFRESH_TOKEN) {
        return reply(
            '❌ *Google Drive credentials නැහැ!*\n\n' +
            'config.env එකේ add කරන්න:\n' +
            '```\nGDRIVE_CLIENT_ID=\nGDRIVE_CLIENT_SECRET=\nGDRIVE_REFRESH_TOKEN=\n```\n\n' +
            'Setup guide: https://developers.google.com/oauthplayground'
        );
    }

    const MEDIA_TYPES = ['imageMessage','videoMessage','documentMessage','audioMessage'];
    const type        = m.type;
    const quotedType  = m.quoted ? Object.keys(m.quoted)[0] : null;
    const hasMedia    = MEDIA_TYPES.includes(type);
    const hasQuoted   = quotedType && MEDIA_TYPES.includes(quotedType);

    if (!hasMedia && !hasQuoted) {
        return reply('📎 File/Image/Video/Audio එකට reply කරලා `.gdup` ලියන්න!');
    }

    await reply('☁️ File download + Google Drive upload prepare කරනවා...');

    try {
        // Build downloadable message object
        let dlMsg    = mek;
        let dlType   = type;
        let fileName = `upload_${Date.now()}`;
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
            mimeType = mediaMsg.mimetype  || mimeType;
            fileName = mediaMsg.fileName  ||
                       `${dlType.replace('Message', '')}_${Date.now()}`;
        }

        // Download file from WhatsApp
        const buffer  = await conn.downloadMediaMessage(dlMsg);
        const sizeMB  = buffer.length / 1024 / 1024;

        if (sizeMB > MAX_SIZE_MB) {
            return reply(`❌ File size (${sizeMB.toFixed(1)} MB) limit exceed කරලා! Max: ${MAX_SIZE_MB} MB`);
        }

        await reply(`📤 Uploading: *${fileName}* (${sizeMB.toFixed(2)} MB)...`);

        // Get access token
        const token = await getAccessToken();

        // ── Multipart upload to Google Drive ─────────────────────────────────
        const boundary   = '----NovaUploadBoundary' + Date.now();
        const metadata   = JSON.stringify({
            name:    fileName,
            parents: config.GDRIVE_FOLDER_ID ? [config.GDRIVE_FOLDER_ID] : []
        });

        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
            buffer,
            Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await axios.post(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            body,
            {
                headers: {
                    'Authorization':  `Bearer ${token}`,
                    'Content-Type':   `multipart/related; boundary="${boundary}"`,
                    'Content-Length': body.length
                },
                maxBodyLength:    Infinity,
                maxContentLength: Infinity,
                timeout:          120000
            }
        );

        const fileId = uploadRes.data.id;

        // Make file publicly accessible (anyone with link can view)
        await axios.post(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            { role: 'reader', type: 'anyone' },
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );

        const shareLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

        await reply(
            `✅ *Google Drive Upload සාර්ථකයි!*\n\n` +
            `📁 *File  :* ${fileName}\n` +
            `📦 *Size  :* ${sizeMB.toFixed(2)} MB\n` +
            `🆔 *ID    :* ${fileId}\n` +
            `🔗 *Link  :* ${shareLink}`
        );

    } catch (e) {
        console.log('GDrive upload error:', e.message);
        await reply(`❌ Upload Error: ${e.message}`);
    }
});
