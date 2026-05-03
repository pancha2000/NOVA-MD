'use strict';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   NOVA-MD — YouTube → Cloud Upload Plugin           ║
 * ║                                                      ║
 * ║   .ytmega  → YouTube download → Mega.nz upload      ║
 * ║   .ytdrive → YouTube download → Google Drive upload ║
 * ║   .ytinfo  → YouTube video info (no download)       ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Setup:
 *   Mega   → config.env: MEGA_EMAIL, MEGA_PASSWORD
 *   GDrive → config.env: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET,
 *                        GDRIVE_REFRESH_TOKEN, GDRIVE_FOLDER_ID (optional)
 */

const { cmd }          = require('../lib/commands');
const config           = require('../config');
const { File, Storage } = require('megajs');
const ytdlp            = require('yt-dlp-exec');
const axios            = require('axios');
const fs               = require('fs');
const path             = require('path');
const { exec }         = require('child_process');
const util             = require('util');
const execPromise      = util.promisify(exec);

// ━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const MAX_DURATION_MINUTES = 60;   // yt-dlp download max duration
const TMP_DIR              = '/tmp';

// ━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Sanitise a filename so it's safe on all OSes */
function safeFilename(raw) {
    return (raw || 'video')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 120);
}

/** Human-readable duration  e.g.  "1h 23m 45s" */
function fmtDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

/** Human-readable file size */
function fmtSize(bytes) {
    if (!bytes) return '0 B';
    const mb = bytes / 1024 / 1024;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Delete temp files silently */
function cleanup(...files) {
    for (const f of files) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }
}

// ━━ YouTube Info ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Fetch YouTube video metadata via yt-dlp (no download) */
async function getYTInfo(url) {
    return ytdlp(url, {
        dumpSingleJson:  true,
        noWarnings:      true,
        noCallHome:      true,
        noCheckCertificate: true,
    });
}

/**
 * Download YouTube video to a tmp file.
 * Returns { filePath, title, uploader, duration, sizeMB }
 */
async function downloadYT(url, onProgress) {
    const tmpPath = path.join(TMP_DIR, `yt_${Date.now()}.mp4`);

    // 1. Fetch info first
    let info;
    try {
        info = await getYTInfo(url);
    } catch (e) {
        throw new Error(
            'YouTube info ගන්න බැරිඋනා.\n' +
            '• URL valid ද?\n• Private/Age-restricted video නොවේද?\n\nError: ' + e.message
        );
    }

    const title    = info.title    || 'YouTube Video';
    const duration = info.duration || 0;
    const uploader = info.uploader || info.channel || 'Unknown';

    if (duration > MAX_DURATION_MINUTES * 60) {
        throw new Error(
            `Video too long! (${fmtDuration(duration)})\n` +
            `Max allowed: ${MAX_DURATION_MINUTES} minutes`
        );
    }

    if (onProgress) await onProgress(
        `📥 *Downloading from YouTube...*\n\n` +
        `🎬 *${title}*\n` +
        `👤 ${uploader}\n` +
        `⏱️  ${fmtDuration(duration)}\n\n` +
        `⏳ Please wait...`
    );

    // 2. Download best mp4
    await ytdlp(url, {
        output:            tmpPath,
        format:            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        mergeOutputFormat: 'mp4',
        noWarnings:        true,
        noCallHome:        true,
        noCheckCertificate: true,
    });

    // yt-dlp sometimes appends .mp4 even if already present
    let finalPath = tmpPath;
    if (!fs.existsSync(tmpPath)) {
        const alt = tmpPath + '.mp4';
        if (fs.existsSync(alt)) finalPath = alt;
        else throw new Error('Download complete වුනත් file හොයාගන්න බැරිඋනා!');
    }

    const sizeMB = fs.statSync(finalPath).size / 1024 / 1024;

    return { filePath: finalPath, title, uploader, duration, sizeMB };
}

// ━━ Mega Upload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Upload a local file to Mega.nz.
 * Returns public share link.
 */
async function uploadToMega(filePath, fileName) {
    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD) {
        throw new Error(
            'Mega credentials නැහැ!\n\n' +
            'config.env එකේ add කරන්න:\n' +
            'MEGA_EMAIL=your@email.com\nMEGA_PASSWORD=yourpassword'
        );
    }

    const buffer   = fs.readFileSync(filePath);
    const storage  = new Storage({
        email:    config.MEGA_EMAIL,
        password: config.MEGA_PASSWORD,
    });

    // Login (with 45s timeout)
    await Promise.race([
        storage.ready,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Mega login timeout (45s)')), 45000)
        ),
    ]);

    // Upload — use callback form for compatibility with megajs v1.x
    const uploadedFile = await new Promise((resolve, reject) => {
        const uploadStream = storage.upload(
            { name: fileName, size: buffer.length },
            (err, file) => { if (err) reject(err); else resolve(file); }
        );
        uploadStream.on('error', reject);
        uploadStream.end(buffer);
    });

    // Share link
    const link = await uploadedFile.link();

    try { storage.close(); } catch (_) {}

    return link;
}

// ━━ Google Drive Upload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Refresh OAuth2 token */
async function getGDriveToken() {
    const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = config;
    if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
        throw new Error(
            'Google Drive credentials නැහැ!\n\n' +
            'config.env:\n' +
            'GDRIVE_CLIENT_ID=\nGDRIVE_CLIENT_SECRET=\nGDRIVE_REFRESH_TOKEN='
        );
    }
    const res = await axios.post('https://oauth2.googleapis.com/token', null, {
        params: {
            client_id:     GDRIVE_CLIENT_ID,
            client_secret: GDRIVE_CLIENT_SECRET,
            refresh_token: GDRIVE_REFRESH_TOKEN,
            grant_type:    'refresh_token',
        }
    });
    return res.data.access_token;
}

/**
 * Upload a local file to Google Drive using resumable upload.
 * Returns { id, name, webViewLink }
 */
async function uploadToGDrive(filePath, fileName, mimeType = 'video/mp4') {
    const token    = await getGDriveToken();
    const fileSize = fs.statSync(filePath).size;

    // Metadata
    const meta = { name: fileName, mimeType };
    if (config.GDRIVE_FOLDER_ID) meta.parents = [config.GDRIVE_FOLDER_ID];

    // Initiate resumable session
    const initRes = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        meta,
        {
            headers: {
                Authorization:  `Bearer ${token}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': fileSize,
            }
        }
    );
    const sessionUri = initRes.headers.location;
    if (!sessionUri) throw new Error('Google Drive session URI ගන්න බැරිඋනා!');

    // Upload binary
    const fileBuffer = fs.readFileSync(filePath);
    await axios.put(sessionUri, fileBuffer, {
        headers: {
            'Content-Type':   mimeType,
            'Content-Length': fileSize,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });

    // Make publicly viewable
    const tokenForPerm = await getGDriveToken(); // refresh just in case
    const listRes = await axios.get(
        'https://www.googleapis.com/drive/v3/files',
        {
            headers:  { Authorization: `Bearer ${tokenForPerm}` },
            params:   {
                q:      `name='${fileName.replace(/'/g, "\\'")}' and trashed=false`,
                fields: 'files(id,name,webViewLink)',
                orderBy: 'createdTime desc',
                pageSize: 1,
            },
        }
    );

    const uploaded = listRes.data.files?.[0];
    if (!uploaded) throw new Error('Uploaded file Drive ඇතුලේ හොයාගන්න බැරිඋනා!');

    // Set permission: anyone with link can view
    const tokenForShare = await getGDriveToken();
    await axios.post(
        `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
        { role: 'reader', type: 'anyone' },
        { headers: { Authorization: `Bearer ${tokenForShare}` } }
    );

    // Build shareable link
    const shareLink = `https://drive.google.com/file/d/${uploaded.id}/view?usp=sharing`;

    return { id: uploaded.id, name: fileName, webViewLink: shareLink };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .ytinfo — Video info only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'ytinfo',
    alias:    ['yti', 'ytcheck'],
    desc:     'YouTube video info බලන්න (download නෑ)',
    category: 'youtube',
    use:      '.ytinfo <YouTube URL>',
    react:    'ℹ️'
}, async (conn, mek, m, { reply, q }) => {
    if (!q) return reply(
        '❌ *URL දෙන්නේ නැහැ!*\n\n' +
        '📌 *Usage:* `.ytinfo <YouTube URL>`'
    );
    if (!q.startsWith('http')) return reply('❌ Valid YouTube URL දෙන්න!');

    await reply('🔍 Video info load කරනවා...');

    try {
        const info      = await getYTInfo(q);
        const title     = info.title     || 'Unknown';
        const uploader  = info.uploader  || info.channel || 'Unknown';
        const duration  = info.duration  || 0;
        const views     = info.view_count ? Number(info.view_count).toLocaleString() : 'N/A';
        const likes     = info.like_count ? Number(info.like_count).toLocaleString() : 'N/A';
        const uploadDate = info.upload_date
            ? `${info.upload_date.slice(0,4)}-${info.upload_date.slice(4,6)}-${info.upload_date.slice(6)}`
            : 'N/A';

        // Estimate file size from best format
        let estSize = 'N/A';
        if (info.formats) {
            const mp4Formats = info.formats.filter(f =>
                f.ext === 'mp4' && f.filesize
            );
            if (mp4Formats.length) {
                const best = mp4Formats[mp4Formats.length - 1];
                estSize = fmtSize(best.filesize);
            }
        }

        await reply(
            `🎬 *YouTube Video Info*\n\n` +
            `📌 *Title    :* ${title}\n` +
            `👤 *Channel  :* ${uploader}\n` +
            `⏱️  *Duration :* ${fmtDuration(duration)}\n` +
            `👁️  *Views    :* ${views}\n` +
            `👍 *Likes    :* ${likes}\n` +
            `📅 *Uploaded :* ${uploadDate}\n` +
            `📦 *Est. Size:* ${estSize}\n\n` +
            `🔗 ${q}\n\n` +
            `💡 Download කරන්න:\n` +
            `  *.ytmega* ${q}  → Mega.nz\n` +
            `  *.ytdrive* ${q} → Google Drive`
        );
    } catch (e) {
        await reply(`❌ Error: ${e.message}`);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .ytmega — YouTube → Mega.nz
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'ytmega',
    alias:    ['ytm', 'ym', 'youtube2mega'],
    desc:     'YouTube video download → Mega.nz upload',
    category: 'youtube',
    use:      '.ytmega <YouTube URL>',
    react:    '☁️'
}, async (conn, mek, m, { reply, q }) => {
    if (!q) return reply(
        `❌ *URL දෙන්නේ නැහැ!*\n\n` +
        `📌 *Usage:*\n\`.ytmega <YouTube URL>\`\n\n` +
        `*Example:*\n\`.ytmega https://youtu.be/dQw4w9WgXcQ\``
    );
    if (!q.startsWith('http')) return reply('❌ Valid YouTube URL දෙන්න!');

    if (!config.MEGA_EMAIL || !config.MEGA_PASSWORD) {
        return reply(
            '❌ *Mega credentials නැහැ!*\n\n' +
            'config.env:\n' +
            '```\nMEGA_EMAIL=your@email.com\nMEGA_PASSWORD=yourpassword\n```'
        );
    }

    let filePath = null;

    try {
        // ── Step 1: Download ──────────────────────────────────────────────
        const result = await downloadYT(q, (msg) => reply(msg));
        filePath = result.filePath;

        const { title, uploader, duration, sizeMB } = result;
        const fileName = safeFilename(title) + '.mp4';

        await reply(
            `✅ *Download Complete!*\n\n` +
            `📦 Size: ${sizeMB.toFixed(2)} MB\n` +
            `☁️ Mega.nz upload start කරනවා...\n` +
            `⏳ Please wait...`
        );

        // ── Step 2: Upload to Mega ────────────────────────────────────────
        const link = await uploadToMega(filePath, fileName);

        await reply(
            `✅ *Mega.nz Upload සාර්ථකයි!*\n\n` +
            `🎬 *Title    :* ${title}\n` +
            `👤 *Channel  :* ${uploader}\n` +
            `⏱️  *Duration :* ${fmtDuration(duration)}\n` +
            `📦 *Size     :* ${sizeMB.toFixed(2)} MB\n\n` +
            `🔗 *Mega Link :*\n${link}`
        );

    } catch (e) {
        console.error('[YTMEGA ERROR]', e.message);
        await reply(`❌ Error: ${e.message}`);
    } finally {
        if (filePath) cleanup(filePath);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .ytdrive — YouTube → Google Drive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'ytdrive',
    alias:    ['ytd', 'yd', 'youtube2drive'],
    desc:     'YouTube video download → Google Drive upload',
    category: 'youtube',
    use:      '.ytdrive <YouTube URL>',
    react:    '📁'
}, async (conn, mek, m, { reply, q }) => {
    if (!q) return reply(
        `❌ *URL දෙන්නේ නැහැ!*\n\n` +
        `📌 *Usage:*\n\`.ytdrive <YouTube URL>\`\n\n` +
        `*Example:*\n\`.ytdrive https://youtu.be/dQw4w9WgXcQ\``
    );
    if (!q.startsWith('http')) return reply('❌ Valid YouTube URL දෙන්න!');

    const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = config;
    if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
        return reply(
            '❌ *Google Drive credentials නැහැ!*\n\n' +
            'config.env:\n' +
            '```\nGDRIVE_CLIENT_ID=\nGDRIVE_CLIENT_SECRET=\nGDRIVE_REFRESH_TOKEN=\n```\n\n' +
            '📖 Setup guide: plugins/gdrive.js comment block බලන්න'
        );
    }

    let filePath = null;

    try {
        // ── Step 1: Download ──────────────────────────────────────────────
        const result = await downloadYT(q, (msg) => reply(msg));
        filePath = result.filePath;

        const { title, uploader, duration, sizeMB } = result;
        const fileName = safeFilename(title) + '.mp4';

        await reply(
            `✅ *Download Complete!*\n\n` +
            `📦 Size: ${sizeMB.toFixed(2)} MB\n` +
            `📁 Google Drive upload start කරනවා...\n` +
            `⏳ Please wait...`
        );

        // ── Step 2: Upload to Google Drive ────────────────────────────────
        const { webViewLink } = await uploadToGDrive(filePath, fileName, 'video/mp4');

        await reply(
            `✅ *Google Drive Upload සාර්ථකයි!*\n\n` +
            `🎬 *Title    :* ${title}\n` +
            `👤 *Channel  :* ${uploader}\n` +
            `⏱️  *Duration :* ${fmtDuration(duration)}\n` +
            `📦 *Size     :* ${sizeMB.toFixed(2)} MB\n\n` +
            `🔗 *Drive Link :*\n${webViewLink}`
        );

    } catch (e) {
        console.error('[YTDRIVE ERROR]', e.message);
        await reply(`❌ Error: ${e.message}`);
    } finally {
        if (filePath) cleanup(filePath);
    }
});
