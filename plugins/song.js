/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║        APEX-MD V2  –  YouTube Download Plugin         ║
 * ║                    UPDATED FOR YOUR API                ║
 * ║                                                       ║
 * ║  Commands                                             ║
 * ║    .song  | .play | .yt  | .ytmp3   – audio (mp3)    ║
 * ║    .video | .ytmp4 | .ytvideo       – video (mp4)    ║
 * ║                                                       ║
 * ║  API Response Format (Your API)                       ║
 * ║    {                                                  ║
 * ║      "success": true,                                 ║
 * ║      "title": "...",                                  ║
 * ║      "download_url": "https://...",                   ║
 * ║      "quality": "audio",                              ║
 * ║      "duration": 193,                                 ║
 * ║      "thumbnail": "https://..."                       ║
 * ║    }                                                  ║
 * ╚═══════════════════════════════════════════════════════════╝
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

function getRandom(ext) {
    return `${Math.floor(Math.random() * 1000000)}${ext}`;
}

function ensureTemp() {
    const dir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function formatDuration(totalSec) {
    totalSec = Number(totalSec) || 0;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function formatViews(v) {
    return Number(v).toLocaleString();
}

// ──────────────────────────────────────────────────────────
//  API HELPERS - UPDATED FOR YOUR API FORMAT
// ──────────────────────────────────────────────────────────

function getBaseUrl() {
    let raw = (config.YOUTUBE_API || '').trim();
    if (!raw) return null;
    if (!raw.startsWith('http')) raw = 'https://' + raw;
    return raw.replace(/\/+$/, '');
}

function apiClient() {
    return axios.create({
        headers: {
            'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept'     : 'application/json'
        },
        timeout: 90000   // 90 seconds for download
    });
}

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

function thumbFromId(id) {
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

// ──────────────────────────────────────────────────────────
//  DOWNLOAD USING YOUR API - RETURNS BUFFER
// ──────────────────────────────────────────────────────────
async function downloadFromYourApi(videoUrl, quality = 'audio') {
    const base = getBaseUrl();
    if (!base) {
        throw new Error('YOUTUBE_API not configured in config.env');
    }

    console.log(`[API] Calling: ${base}/api/download`);
    console.log(`[API] URL: ${videoUrl}`);
    console.log(`[API] Quality: ${quality}`);

    try {
        const client = apiClient();
        
        // Call YOUR API
        const response = await client.get(`${base}/api/download`, {
            params: {
                url: videoUrl,
                quality: quality
            },
            timeout: 90000
        });

        console.log('[API] Response received:', response.status);

        // Check if API returned success
        if (!response.data || !response.data.success) {
            console.error('[API] API returned error:', response.data);
            throw new Error(response.data?.error || 'API returned no data');
        }

        const data = response.data;
        console.log('[API] Title:', data.title);
        console.log('[API] Download URL present:', !!data.download_url);

        // Get the direct download link
        if (!data.download_url) {
            throw new Error('No download URL in API response');
        }

        // Download the actual file from the URL
        console.log('[Download] Fetching file from URL...');
        const fileResponse = await axios.get(data.download_url, {
            responseType: 'arraybuffer',
            timeout: 120000,  // 2 minutes for actual download
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('[Download] File downloaded, size:', fileResponse.data.byteLength, 'bytes');

        // Return buffer along with metadata
        return {
            buffer: Buffer.from(fileResponse.data),
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnail,
            quality: data.quality
        };

    } catch (error) {
        console.error('[API] Error:', error.message);
        if (error.response) {
            console.error('[API] Response status:', error.response.status);
            console.error('[API] Response data:', error.response.data);
        }
        throw error;
    }
}

// ──────────────────────────────────────────────────────────
//  RESOLVE INPUT: search or direct link
// ──────────────────────────────────────────────────────────
async function resolveInput(text) {
    const isLink = text.startsWith('http') &&
                   (text.includes('youtube') || text.includes('youtu.be'));

    if (isLink) {
        // Direct YouTube link
        const id = extractVideoId(text);
        if (!id) return null;

        // Get metadata from yt-search
        try {
            const res = await yts({ videoId: id });
            const v = res.videos && res.videos[0];
            if (v) {
                return {
                    videoUrl: text,
                    videoInfo: {
                        title: v.title,
                        duration: v.seconds,
                        views: v.views,
                        author: v.author?.name || 'Unknown',
                        thumbnail: v.thumbnail,
                        videoId: id
                    }
                };
            }
        } catch (_) {
            // Fallback: just use the URL with minimal info
            return {
                videoUrl: text,
                videoInfo: {
                    title: 'YouTube Video',
                    duration: 0,
                    views: 0,
                    author: 'Unknown',
                    thumbnail: thumbFromId(id),
                    videoId: id
                }
            };
        }
    } else {
        // Search query
        try {
            const results = await yts(text);
            const video = results.videos && results.videos[0];
            if (!video) return null;

            return {
                videoUrl: video.url,
                videoInfo: {
                    title: video.title,
                    duration: video.seconds,
                    views: video.views,
                    author: video.author?.name || 'Unknown',
                    thumbnail: video.thumbnail,
                    videoId: video.videoId
                }
            };
        } catch (_) {
            return null;
        }
    }

    return null;
}

// ══════════════════════════════════════════════════════════════
//  .song  |  .play  |  .yt  |  .ytmp3       –  AUDIO DOWNLOAD
// ══════════════════════════════════════════════════════════════
cmd({
    pattern:  'song',
    alias:    ['play', 'yt', 'ytmp3'],
    desc:     'Download YouTube audio as mp3',
    category: 'downloads',
    react:    '🎵',
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        // ── no input ──
        if (!text) {
            return await reply(
                '❌ Please give a song name or YouTube link!\n\n' +
                'Examples:\n' +
                '  .song faded\n' +
                '  .song https://www.youtube.com/watch?v=xxxxx'
            );
        }

        // ── API key not configured ──
        if (!config.YOUTUBE_API) {
            return await reply(
                '❌ YOUTUBE_API is not set in config.env!\n\n' +
                'Add this line to your config.env:\n' +
                'YOUTUBE_API=operational-babbie-h79160251-a8340c9a.koyeb.app'
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

        // ── duration guard  (max 10 min for audio) ──
        const durSec = Number(videoInfo.duration) || 0;
        if (durSec > 600) {
            await m.react('❌');
            return await reply('❌ Song is too long! Maximum allowed is 10 minutes.');
        }

        await m.react('⏳');

        // ── send info card ──
        const infoMsg =
`╔═══════════════════════════╗
║   🎵 *SONG DOWNLOADER*    ║
╚═══════════════════════════╝

📌 *Title:*    ${videoInfo.title}
👤 *Artist:*   ${videoInfo.author}
⏱️  *Duration:* ${formatDuration(durSec)}
👁️  *Views:*    ${formatViews(videoInfo.views)}
🔗 *URL:*      ${videoUrl}

⏳ *Downloading from API...*`;

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

        // ── download using YOUR API ──
        console.log('[Song] Starting download...');
        const downloadResult = await downloadFromYourApi(videoUrl, 'audio');
        
        if (!downloadResult || !downloadResult.buffer || downloadResult.buffer.byteLength === 0) {
            await m.react('❌');
            return await reply(
                '❌ Download failed!\n\n' +
                'Possible reasons:\n' +
                '  • API server error\n' +
                '  • Video is private/age-restricted\n' +
                '  • Try again in a few seconds'
            );
        }

        console.log('[Song] Download successful, file size:', downloadResult.buffer.byteLength);

        // ── write to temp file ──
        const tempDir  = ensureTemp();
        const filePath = path.join(tempDir, getRandom('.mp3'));
        fs.writeFileSync(filePath, downloadResult.buffer);

        // clean title for file name
        const safeTitle = (downloadResult.title || videoInfo.title)
            .replace(/[^a-zA-Z0-9 _-]/g, '')
            .substring(0, 60) || 'song';

        // grab thumbnail buffer
        let thumbBuf = null;
        try {
            const thumbUrl = downloadResult.thumbnail || videoInfo.thumbnail;
            if (thumbUrl) {
                const thumbRes = await axios.get(thumbUrl, {
                    responseType: 'arraybuffer',
                    timeout: 5000
                });
                thumbBuf = Buffer.from(thumbRes.data);
            }
        } catch (_) { /* thumbnail is optional */ }

        // ── send the audio file ──
        await conn.sendMessage(m.from, {
            audio:    { url: filePath },
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title:     downloadResult.title || videoInfo.title,
                    body:      `APEX-MD V2 | ${formatDuration(downloadResult.duration || durSec)}`,
                    thumbnail: thumbBuf,
                    mediaType: 1,
                    mediaUrl:  videoUrl,
                    sourceUrl: videoUrl
                }
            }
        }, { quoted: mek });

        await m.react('✅');
        console.log('[Song] Sent successfully!');

        // ── clean up ──
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}

    } catch (e) {
        await m.react('❌');
        console.error('[Song] Error:', e);
        await reply('❌ Download error: ' + e.message);
    }
});

// ══════════════════════════════════════════════════════════════
//  .video  |  .ytmp4  |  .ytvideo       –  VIDEO DOWNLOAD
// ══════════════════════════════════════════════════════════════
cmd({
    pattern:  'video',
    alias:    ['ytmp4', 'ytvideo'],
    desc:     'Download YouTube video as mp4',
    category: 'downloads',
    react:    '🎥',
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        // ── no input ──
        if (!text) {
            return await reply(
                '❌ Please give a video name or YouTube link!\n\n' +
                'Examples:\n' +
                '  .video faded\n' +
                '  .video https://www.youtube.com/watch?v=xxxxx'
            );
        }

        // ── API key not configured ──
        if (!config.YOUTUBE_API) {
            return await reply(
                '❌ YOUTUBE_API is not set in config.env!\n\n' +
                'Add this line to your config.env:\n' +
                'YOUTUBE_API=operational-babbie-h79160251-a8340c9a.koyeb.app'
            );
        }

        await m.react('🔎');

        // ── resolve search / link ──
        const result = await resolveInput(text);
        if (!result) {
            await m.react('❌');
            return await reply('❌ No video found for that query. Try a different name.');
        }
        const { videoUrl, videoInfo } = result;

        // ── duration guard (max 15 min) ──
        const durSec = Number(videoInfo.duration) || 0;
        if (durSec > 900) {
            await m.react('❌');
            return await reply('❌ Video is too long! Maximum allowed is 15 minutes.');
        }

        await m.react('⏳');

        // ── send info card ──
        const infoMsg =
`╔═══════════════════════════╗
║   🎥 *VIDEO DOWNLOADER*   ║
╚═══════════════════════════╝

📌 *Title:*    ${videoInfo.title}
👤 *Author:*   ${videoInfo.author}
⏱️  *Duration:* ${formatDuration(durSec)}
👁️  *Views:*    ${formatViews(videoInfo.views)}
🔗 *URL:*      ${videoUrl}

⏳ *Downloading...*
⚠️  This may take a moment.`;

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

        // ── download using YOUR API (best quality for video) ──
        console.log('[Video] Starting download...');
        const downloadResult = await downloadFromYourApi(videoUrl, 'best');

        if (!downloadResult || !downloadResult.buffer || downloadResult.buffer.byteLength === 0) {
            await m.react('❌');
            return await reply(
                '❌ Video download failed!\n\n' +
                'Possible reasons:\n' +
                '  • API server error\n' +
                '  • Video is private/age-restricted\n' +
                '  • Try again in a few seconds'
            );
        }

        console.log('[Video] Download successful, file size:', downloadResult.buffer.byteLength);

        // ── size guard (WhatsApp ~100MB limit) ──
        const sizeMB = downloadResult.buffer.byteLength / (1024 * 1024);
        if (sizeMB > 100) {
            await m.react('❌');
            return await reply(
                '❌ Video is too large for WhatsApp (over 100 MB).\n' +
                `Current size: ${sizeMB.toFixed(1)} MB\n\n` +
                'Try:\n' +
                '  • A shorter video\n' +
                '  • Audio only (.song command)'
            );
        }

        // ── write to temp file ──
        const tempDir  = ensureTemp();
        const filePath = path.join(tempDir, getRandom('.mp4'));
        fs.writeFileSync(filePath, downloadResult.buffer);

        const safeTitle = (downloadResult.title || videoInfo.title)
            .replace(/[^a-zA-Z0-9 _-]/g, '')
            .substring(0, 60) || 'video';

        // ── send video ──
        await conn.sendMessage(m.from, {
            video:    { url: filePath },
            caption:  `🎥 *${downloadResult.title || videoInfo.title}*\n\n` +
                      `⏱️ ${formatDuration(downloadResult.duration || durSec)} | ` +
                      `👁️ ${formatViews(videoInfo.views)} | ` +
                      `📦 ${sizeMB.toFixed(1)} MB\n\n` +
                      `_APEX-MD V2_`,
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`
        }, { quoted: mek });

        await m.react('✅');
        console.log('[Video] Sent successfully!');

        // ── clean up ──
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}

    } catch (e) {
        await m.react('❌');
        console.error('[Video] Error:', e);
        await reply('❌ Video download error: ' + e.message);
    }
});
