'use strict';

/**
 * ╔══════════════════════════════════════╗
 * ║   NOVA-MD — MediaFire Plugin        ║
 * ║   .mfdl  → MediaFire download       ║
 * ╚══════════════════════════════════════╝
 */

const { cmd } = require('../lib/commands');
const axios   = require('axios');

const MAX_SIZE_MB = 100;

const HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

// ── Helper: Scrape direct download link from MediaFire page ──────────────────
async function getMediaFireDirectLink(pageUrl) {
    const res  = await axios.get(pageUrl, { headers: HEADERS, timeout: 15000 });
    const html = res.data;

    // MediaFire embeds the download URL in multiple places — try all patterns
    const patterns = [
        // Download button href
        /id="downloadButton"[^>]+href="([^"]+)"/,
        /aria-label="Download file"[^>]+href="([^"]+)"/,
        // Inline JS assignment
        /"downloadURL"\s*:\s*"([^"]+)"/,
        /window\.location\.href\s*=\s*['"]([^'"]+download[^'"]+)['"]/,
        // Direct CDN link in anchor tags
        /href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/,
        // fallback data attribute
        /data-url="(https:\/\/[^"]*mediafire[^"]+)"/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1] && !match[1].includes('mediafire.com/#')) {
            return match[1].replace(/&amp;/g, '&');
        }
    }

    // Newer MediaFire: look for JSON data block
    const jsonMatch = html.match(/MediaFireSettings\.set\(({[^}]+})\)/);
    if (jsonMatch) {
        try {
            const obj = JSON.parse(jsonMatch[1].replace(/'/g, '"'));
            if (obj.downloadURL) return obj.downloadURL;
        } catch (_) {}
    }

    throw new Error(
        'Direct download link හොයාගන්න බැරිවුනා!\n' +
        'File delete වෙලා / private / restrict වෙලා ඇති.'
    );
}

// ── Helper: Get filename & size from URL/headers ──────────────────────────────
function extractFileName(url, headers) {
    // From Content-Disposition
    const disp = headers['content-disposition'] || '';
    const nm   = disp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (nm) return decodeURIComponent(nm[1].replace(/['"]/g, '').trim());

    // From URL path
    try {
        const urlPath = new URL(url).pathname;
        const name    = urlPath.split('/').pop();
        if (name) return decodeURIComponent(name.split('?')[0]);
    } catch (_) {}

    return `mediafire_${Date.now()}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// .mfdl — MediaFire Download
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd({
    pattern:  'mfdl',
    alias:    ['mediafire', 'mfire', 'mf'],
    desc:     'MediaFire file download කරන්න',
    category: 'download',
    use:      '.mfdl <mediafire url>',
    react:    '🔥'
}, async (conn, mek, m, { reply, text }) => {
    if (!text) return reply(
        '📎 *Usage:* .mfdl <MediaFire URL>\n\n' +
        '*Example:*\n.mfdl https://www.mediafire.com/file/XXXXXXXX/filename.ext/file'
    );

    const url = text.trim();
    if (!url.includes('mediafire.com')) {
        return reply('❌ Valid MediaFire link එකක් දෙන්න!\n\nFormat: https://www.mediafire.com/file/...');
    }

    await reply('🔥 MediaFire page ඉදල download link හොයනවා...');

    try {
        // Step 1: Get direct download link from the page
        const directUrl = await getMediaFireDirectLink(url);

        await reply('📥 Downloading file...');

        // Step 2: Download the actual file
        const fileRes = await axios({
            method:       'GET',
            url:          directUrl,
            responseType: 'arraybuffer',
            timeout:      120000,
            maxRedirects: 5,
            headers:      HEADERS
        });

        const buffer      = Buffer.from(fileRes.data);
        const contentType = (fileRes.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
        const fileName    = extractFileName(directUrl, fileRes.headers);
        const sizeMB      = buffer.length / 1024 / 1024;

        if (sizeMB > MAX_SIZE_MB) {
            return reply(`❌ File size (${sizeMB.toFixed(1)} MB) limit exceed කරලා! Max: ${MAX_SIZE_MB} MB`);
        }

        await conn.sendMessage(m.from, {
            document: buffer,
            fileName: fileName,
            mimetype: contentType,
            caption:
                `✅ *MediaFire Download සාර්ථකයි!*\n\n` +
                `📁 *File :* ${fileName}\n` +
                `📦 *Size :* ${sizeMB.toFixed(2)} MB`
        }, { quoted: mek });

    } catch (e) {
        console.log('MediaFire download error:', e.message);
        await reply(`❌ Download Error: ${e.message}`);
    }
});
