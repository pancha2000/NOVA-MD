/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║        APEX-MD V2  –  YouTube Download Plugin         ║
 * ║                                                       ║
 * ║  Commands                                             ║
 * ║    .song  | .play | .yt  | .ytmp3   – audio (mp3)    ║
 * ║    .video | .ytmp4 | .ytvideo       – video (mp4)    ║
 * ║                                                       ║
 * ║  How it works                                         ║
 * ║    1. yt-search  – find / get metadata only.          ║
 * ║    2. Koyeb API  – all actual downloading.            ║
 * ║    3. Fallback   – second proxy if Koyeb fails.      ║
 * ║                                                       ║
 * ║  config.env key                                       ║
 * ║    YOUTUBE_API=grateful-philippine-…-7c562040…app    ║
 * ║                                                       ║
 * ║  API endpoints tried (in order)                       ║
 * ║    POST /api/info        { url }                      ║
 * ║    GET  /api/info        ?url=                        ║
 * ║    POST /api/download    { url, type, quality }       ║
 * ║    GET  /api/download    ?url=&type=&quality=         ║
 * ║    GET  youtubeislife…   (fallback proxy)             ║
 * ╚═══════════════════════════════════════════════════════╝
 */

'use strict';

const { cmd }   = require('../lib/commands');
const config    = require('../config');
const yts       = require('yt-search');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');

// ──────────────────────────────────────────────────────────
//  SMALL UTILITIES
// ──────────────────────────────────────────────────────────

// Random file name with the given extension
function getRandom(ext) {
    return `${Math.floor(Math.random() * 1000000)}${ext}`;
}

// Make sure ./temp/ exists and return its absolute path
function ensureTemp() {
    const dir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Seconds  ->  "m:ss"
function formatDuration(totalSec) {
    totalSec = Number(totalSec) || 0;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Number  ->  "1,234,567"
function formatViews(v) {
    return Number(v).toLocaleString();
}

// ──────────────────────────────────────────────────────────
//  API HELPERS
// ──────────────────────────────────────────────────────────

// Build the base URL from the env value.
// Works whether the user stored it with or without "https://".
function getBaseUrl() {
    let raw = (config.YOUTUBE_API || '').trim();
    if (!raw) return null;
    if (!raw.startsWith('http')) raw = 'https://' + raw;
    return raw.replace(/\/+$/, '');          // strip trailing slash
}

// Shared axios instance with safe defaults
function apiClient() {
    return axios.create({
        headers: {
            'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept'     : 'application/json',
            'Content-Type': 'application/json'
        },
        timeout: 60000   // 60 seconds
    });
}

// Extract the YouTube video-ID from any YouTube URL
function extractVideoId(url) {
    try {
        if (url.includes('youtu.be')) {
            return url.split('/').pop().split('?')[0];
        }
        return new URLSearchParams(new URL(url).search).get('v') || '';
    } catch (_) {
        return '';
    }
}

// Default thumbnail URL from a video ID
function thumbFromId(id) {
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

// Normalise whatever shape the API returns into one clean object
function normaliseInfo(raw, videoUrl) {
    const d  = raw.videoDetails || raw;
    const id = d.videoId || extractVideoId(videoUrl);
    return {
        title:     d.title     || 'Unknown',
        duration:  d.duration  || d.lengthSeconds || '0',
        views:     d.views     || d.viewCount     || '0',
        author:    d.author?.name || d.author     || 'Unknown',
        thumbnail: d.thumbnails?.[0]?.url || d.thumbnail || thumbFromId(id),
        videoId:   id
    };
}

// ──────────────────────────────────────────────────────────
//  FETCH VIDEO INFO  (metadata only – nothing downloaded)
// ──────────────────────────────────────────────────────────
async function fetchVideoInfo(videoUrl) {
    const base   = getBaseUrl();
    if (!base) return null;

    const client = apiClient();

    // Attempt 1 – POST /api/info
    try {
        const res = await client.post(`${base}/api/info`, { url: videoUrl });
        if (res.data && (res.data.title || res.data.videoDetails)) {
            return normaliseInfo(res.data, videoUrl);
        }
    } catch (_) { /* next */ }

    // Attempt 2 – GET /api/info?url=…
    try {
        const res = await client.get(`${base}/api/info`, { params: { url: videoUrl } });
        if (res.data && (res.data.title || res.data.videoDetails)) {
            return normaliseInfo(res.data, videoUrl);
        }
    } catch (_) { /* next */ }

    return null;   // both attempts failed
}

// ──────────────────────────────────────────────────────────
//  DOWNLOAD MEDIA  (returns a Buffer holding the file bytes)
// ──────────────────────────────────────────────────────────
//  type    = "audio" | "video"
//  quality = "128"            (audio – kbps)
//          | "360" | "720"    (video – p)
// ──────────────────────────────────────────────────────────
async function downloadMedia(videoUrl, type, quality) {
    const base   = getBaseUrl();
    if (!base) return null;

    const client = apiClient();
    const body   = { url: videoUrl, type, quality };

    // Attempt 1 – POST /api/download
    try {
        const res = await client.post(`${base}/api/download`, body, {
            responseType: 'arraybuffer',
            timeout:      120000
        });
        if (res.data && res.data.byteLength > 0) return Buffer.from(res.data);
    } catch (_) { /* next */ }

    // Attempt 2 – GET /api/download?…
    try {
        const res = await client.get(`${base}/api/download`, {
            params:       body,
            responseType: 'arraybuffer',
            timeout:      120000
        });
        if (res.data && res.data.byteLength > 0) return Buffer.from(res.data);
    } catch (_) { /* next */ }

    // Attempt 3 – public fallback proxy
    try {
        const res = await axios.get('https://api.youtubeislife.com/download', {
            params:       body,
            responseType: 'arraybuffer',
            timeout:      120000,
            headers:      { 'User-Agent': 'Mozilla/5.0' }
        });
        if (res.data && res.data.byteLength > 0) return Buffer.from(res.data);
    } catch (_) { /* next */ }

    return null;   // all three attempts failed
}

// ──────────────────────────────────────────────────────────
//  SHARED: turn user input into { videoUrl, videoInfo }
// ──────────────────────────────────────────────────────────
async function resolveInput(text) {
    let videoUrl  = null;
    let videoInfo = null;

    const isLink = text.startsWith('http') &&
                   (text.includes('youtube') || text.includes('youtu.be'));

    if (isLink) {
        // --- user pasted a direct YouTube link ---
        videoUrl  = text;
        videoInfo = await fetchVideoInfo(videoUrl);   // try API first

        if (!videoInfo) {
            // API returned nothing – fall back to yt-search for metadata
            const id = extractVideoId(videoUrl);
            if (id) {
                try {
                    const res = await yts({ videoId: id });
                    const v   = res.videos && res.videos[0];
                    if (v) {
                        videoInfo = {
                            title:     v.title,
                            duration:  v.seconds,
                            views:     v.views,
                            author:    v.author?.name || 'Unknown',
                            thumbnail: v.thumbnail,
                            videoId:   id
                        };
                    }
                } catch (_) { /* ignore */ }
            }
        }

        // Last-resort defaults so nothing is ever undefined
        if (!videoInfo) {
            videoInfo = {
                title: 'YouTube Video', duration: 0, views: 0,
                author: 'Unknown',
                thumbnail: thumbFromId(extractVideoId(videoUrl)),
                videoId:   extractVideoId(videoUrl)
            };
        }

    } else {
        // --- user typed a search query ---
        const search = await yts(text);
        const video  = search.videos[0];
        if (!video) return null;   // nothing found at all

        videoUrl  = video.url;
        videoInfo = {
            title:     video.title,
            duration:  video.seconds,
            views:     video.views,
            author:    video.author?.name || 'Unknown',
            thumbnail: video.thumbnail,
            videoId:   video.videoId
        };
    }

    return { videoUrl, videoInfo };
}

// ══════════════════════════════════════════════════════════════
//  .song  |  .play  |  .yt  |  .ytmp3      –  AUDIO DOWNLOAD
// ══════════════════════════════════════════════════════════════
cmd({
    pattern:  'song',
    alias:    ['play', 'yt', 'ytmp3'],
    desc:     'Download a YouTube song as audio (mp3)',
    category: 'downloads',
    react:    '🎵',
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        // ── no input ──
        if (!text) {
            return await reply(
                '❌ Please give a song name or a YouTube link!\n\n' +
                'Examples:\n' +
                '  .song faded\n' +
                '  .song https://www.youtube.com/watch?v=xxxxx'
            );
        }

        // ── API key not configured ──
        if (!config.YOUTUBE_API) {
            return await reply(
                '❌ YOUTUBE_API is not set in config.env!\n\n' +
                'Open your config.env file and add:\n' +
                'YOUTUBE_API=grateful-philippine-h79160251-7c562040.koyeb.app'
            );
        }

        await m.react('🔎');

        // ── resolve search / link  ->  URL + info ──
        const result = await resolveInput(text);
        if (!result) {
            await m.react('❌');
            return await reply('❌ No song found for that query. Try a different name.');
        }
        const { videoUrl, videoInfo } = result;

        // ── duration guard  (max 12 min for audio) ──
        const durSec = Number(videoInfo.duration) || 0;
        if (durSec > 720) {
            await m.react('❌');
            return await reply('❌ Song is too long! Maximum allowed is 12 minutes.');
        }

        await m.react('⏳');

        // ── send info card with thumbnail ──
        const infoMsg =
`╔═══════════════════════════╗
║   🎵 *SONG DOWNLOADER*    ║
╚═══════════════════════════╝

📌 *Title:*    ${videoInfo.title}
👤 *Artist:*   ${videoInfo.author}
⏱️  *Duration:* ${formatDuration(durSec)}
👁️  *Views:*    ${formatViews(videoInfo.views)}
🔗 *URL:*      ${videoUrl}

⏳ *Downloading…*`;

        try {
            if (videoInfo.thumbnail) {
                await conn.sendMessage(m.from, {
                    image:   { url: videoInfo.thumbnail },
                    caption: infoMsg
                }, { quoted: mek });
            } else {
                await conn.sendMessage(m.from, { text: infoMsg }, { quoted: mek });
            }
        } catch (_) {
            await conn.sendMessage(m.from, { text: infoMsg }, { quoted: mek });
        }

        // ── download the audio via the API ──
        const buffer = await downloadMedia(
            videoUrl,
            'audio',
            String(config.AUDIO_QUALITY || 128)
        );

        if (!buffer || buffer.byteLength === 0) {
            await m.react('❌');
            return await reply(
                '❌ Download failed!\n\n' +
                'Possible reasons:\n' +
                '  • The video is age-restricted or private.\n' +
                '  • The API server is temporarily unavailable.\n' +
                '  • Please try again after a few seconds.'
            );
        }

        // ── write to temp and send ──
        const tempDir  = ensureTemp();
        const filePath = path.join(tempDir, getRandom('.mp3'));
        fs.writeFileSync(filePath, buffer);

        // clean title for the file name
        const safeTitle = videoInfo.title
            .replace(/[^a-zA-Z0-9 _-]/g, '')
            .substring(0, 60) || 'song';

        // grab thumbnail as a buffer for the WhatsApp context card
        let thumbBuf = null;
        try {
            if (videoInfo.thumbnail) {
                const thumbRes = await axios.get(videoInfo.thumbnail, {
                    responseType: 'arraybuffer',
                    timeout:      5000
                });
                thumbBuf = Buffer.from(thumbRes.data);
            }
        } catch (_) { /* thumbnail is optional */ }

        // send the audio file
        await conn.sendMessage(m.from, {
            audio:    { url: filePath },
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title:     videoInfo.title,
                    body:      `APEX-MD V2 | ${formatDuration(durSec)}`,
                    thumbnail: thumbBuf,
                    mediaType: 1,
                    mediaUrl:  videoUrl,
                    sourceUrl: videoUrl
                }
            }
        }, { quoted: mek });

        await m.react('✅');

        // ── clean up the temp file ──
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}

    } catch (e) {
        await m.react('❌');
        console.log('[song] error:', e);
        await reply('❌ Song download error: ' + e.message);
    }
});

// ══════════════════════════════════════════════════════════════
//  .video  |  .ytmp4  |  .ytvideo       –  VIDEO DOWNLOAD
// ══════════════════════════════════════════════════════════════
cmd({
    pattern:  'video',
    alias:    ['ytmp4', 'ytvideo'],
    desc:     'Download a YouTube video as mp4',
    category: 'downloads',
    react:    '🎥',
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        // ── no input ──
        if (!text) {
            return await reply(
                '❌ Please give a video name or a YouTube link!\n\n' +
                'Examples:\n' +
                '  .video faded\n' +
                '  .video https://www.youtube.com/watch?v=xxxxx'
            );
        }

        // ── API key not configured ──
        if (!config.YOUTUBE_API) {
            return await reply(
                '❌ YOUTUBE_API is not set in config.env!\n\n' +
                'Open your config.env file and add:\n' +
                'YOUTUBE_API=grateful-philippine-h79160251-7c562040.koyeb.app'
            );
        }

        await m.react('🔎');

        // ── resolve search / link  ->  URL + info ──
        const result = await resolveInput(text);
        if (!result) {
            await m.react('❌');
            return await reply('❌ No video found for that query. Try a different name.');
        }
        const { videoUrl, videoInfo } = result;

        // ── duration guard  (max 15 min for video) ──
        const durSec = Number(videoInfo.duration) || 0;
        if (durSec > 900) {
            await m.react('❌');
            return await reply('❌ Video is too long! Maximum allowed is 15 minutes.');
        }

        await m.react('⏳');

        // ── send info card with thumbnail ──
        const infoMsg =
`╔═══════════════════════════╗
║   🎥 *VIDEO DOWNLOADER*   ║
╚═══════════════════════════╝

📌 *Title:*    ${videoInfo.title}
👤 *Author:*   ${videoInfo.author}
⏱️  *Duration:* ${formatDuration(durSec)}
👁️  *Views:*    ${formatViews(videoInfo.views)}
🔗 *URL:*      ${videoUrl}

⏳ *Downloading…*
⚠️  This may take a moment depending on the video size.`;

        try {
            if (videoInfo.thumbnail) {
                await conn.sendMessage(m.from, {
                    image:   { url: videoInfo.thumbnail },
                    caption: infoMsg
                }, { quoted: mek });
            } else {
                await conn.sendMessage(m.from, { text: infoMsg }, { quoted: mek });
            }
        } catch (_) {
            await conn.sendMessage(m.from, { text: infoMsg }, { quoted: mek });
        }

        // ── download the video via the API ──
        const quality = (config.YOUTUBE_QUALITY || '360p').replace(/[^0-9]/g, '') || '360';
        const buffer  = await downloadMedia(videoUrl, 'video', quality);

        if (!buffer || buffer.byteLength === 0) {
            await m.react('❌');
            return await reply(
                '❌ Video download failed!\n\n' +
                'Possible reasons:\n' +
                '  • The video is age-restricted or private.\n' +
                '  • The API server is temporarily unavailable.\n' +
                '  • Please try again after a few seconds.'
            );
        }

        // ── size guard  (WhatsApp limit is roughly 100 MB) ──
        const sizeMB = buffer.byteLength / (1024 * 1024);
        if (sizeMB > 100) {
            await m.react('❌');
            return await reply(
                '❌ The video is too large for WhatsApp (over 100 MB).\n' +
                'Try a shorter video or a lower quality.'
            );
        }

        // ── write to temp and send ──
        const tempDir  = ensureTemp();
        const filePath = path.join(tempDir, getRandom('.mp4'));
        fs.writeFileSync(filePath, buffer);

        const safeTitle = videoInfo.title
            .replace(/[^a-zA-Z0-9 _-]/g, '')
            .substring(0, 60) || 'video';

        await conn.sendMessage(m.from, {
            video:    { url: filePath },
            caption:  `🎥 *${videoInfo.title}*\n\n` +
                      `⏱️ ${formatDuration(durSec)} | ` +
                      `👁️ ${formatViews(videoInfo.views)} | ` +
                      `📦 ${sizeMB.toFixed(1)} MB\n\n` +
                      `_APEX-MD V2_`,
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`
        }, { quoted: mek });

        await m.react('✅');

        // ── clean up the temp file ──
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}

    } catch (e) {
        await m.react('❌');
        console.log('[video] error:', e);
        await reply('❌ Video download error: ' + e.message);
    }
});
