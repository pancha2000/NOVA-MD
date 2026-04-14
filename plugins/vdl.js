'use strict';

const { cmd } = require('../lib/commands');
const ytdlp   = require('yt-dlp-exec');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');
const util    = require('util');
const execPromise = util.promisify(exec);

const MAX_MB      = 180;   // WhatsApp upload limit
const MAX_MINUTES = 30;    // Max video duration

// ── ffmpeg smart compress ─────────────────────────────────────────────────────
async function compressVideo(inputPath, outputPath, targetMB) {
    const fileSizeMB = fs.statSync(inputPath).size / (1024 * 1024);

    // Already small enough
    if (fileSizeMB <= targetMB) {
        fs.copyFileSync(inputPath, outputPath);
        return;
    }

    // Duration ගන්නවා
    const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
    );
    const duration = parseFloat(stdout.trim());

    // Target bitrate calculate කරනවා
    // (targetMB * 8192) / duration = total kbps
    const totalKbps     = (targetMB * 8192) / duration;
    const audioKbps     = 128;
    const videoKbps     = Math.floor(totalKbps - audioKbps - 50);
    const safeVideoKbps = Math.max(videoKbps, 200); // min 200kbps

    const ffmpegCmd =
        `ffmpeg -i "${inputPath}" ` +
        `-c:v libx264 -preset fast -crf 23 ` +
        `-maxrate ${safeVideoKbps}k -bufsize ${safeVideoKbps * 2}k ` +
        `-vf "scale='min(1280,iw)':-2" ` +
        `-c:a aac -b:a ${audioKbps}k ` +
        `-movflags +faststart ` +
        `-y "${outputPath}"`;

    await execPromise(ffmpegCmd);
}

// ── .vdl ─────────────────────────────────────────────────────────────────────
cmd({
    pattern:  'vdl',
    alias:    ['videodl', 'vd'],
    desc:     'ඕනම website එකේ video download කරන්න (max 180MB)',
    category: 'downloader',
    use:      '<video URL>',
    react:    '🎬'
}, async (conn, mek, m, { reply, q }) => {

    if (!q) return reply(
`❌ *URL දෙන්නේ නැහැ!*

📌 *Usage:*
\`.vdl <video page URL>\`

*Example:*
\`.vdl https://somesite.com/video/123\``
    );

    if (!q.startsWith('http://') && !q.startsWith('https://')) {
        return reply('❌ Valid URL එකක් දෙන්න! (https:// ගෙන් start වෙන්න ඕනෙ)');
    }

    await reply('⏳ *Video info ගනිමින් ඉන්නෙමි...*');

    const tmpRaw   = path.join('/tmp', `vdl_raw_${Date.now()}.mp4`);
    const tmpFinal = path.join('/tmp', `vdl_final_${Date.now()}.mp4`);

    try {
        // ── Step 1: Info ගන්නවා ───────────────────────────────────────────
        let info;
        try {
            info = await ytdlp(q, {
                dumpSingleJson: true,
                noWarnings: true,
                noCallHome: true,
            });
        } catch (e) {
            return reply(
`❌ *Video හොයාගන්න බැරිඋනා!*

හේතු:
• Site එක support නෑ
• Login ඕන site එකක්
• URL එක wrong`
            );
        }

        const title      = info.title    || 'Video';
        const duration   = info.duration || 0;
        const uploader   = info.uploader || info.channel || 'Unknown';
        const durationMin = Math.floor(duration / 60);
        const durationSec = Math.floor(duration % 60);

        if (duration > MAX_MINUTES * 60) {
            return reply(
`❌ *Video too long!*

⏱️ Duration : ${durationMin}m ${durationSec}s
📌 Max limit : ${MAX_MINUTES} minutes`
            );
        }

        await reply(
`📥 *Downloading...*

🎬 *${title}*
👤 ${uploader}
⏱️ ${durationMin}m ${durationSec}s`
        );

        // ── Step 2: Download කරනවා ────────────────────────────────────────
        await ytdlp(q, {
            output: tmpRaw,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            mergeOutputFormat: 'mp4',
            noWarnings: true,
            noCallHome: true,
        });

        if (!fs.existsSync(tmpRaw)) {
            return reply('❌ Download failed. File හොයාගන්න බැරිඋනා.');
        }

        const rawMB = (fs.statSync(tmpRaw).size / (1024 * 1024)).toFixed(1);

        // ── Step 3: Compress කරනවා ────────────────────────────────────────
        if (parseFloat(rawMB) > MAX_MB) {
            await reply(
`⚙️ *Compressing...*

📦 Original : ${rawMB}MB
🎯 Target   : under ${MAX_MB}MB
⏳ ටිකක් ඉන්න...`
            );
        }

        await compressVideo(tmpRaw, tmpFinal, MAX_MB);

        const finalMB = (fs.statSync(tmpFinal).size / (1024 * 1024)).toFixed(1);

        if (parseFloat(finalMB) > MAX_MB) {
            return reply(
`❌ *Compress කළාට ${finalMB}MB — ${MAX_MB}MB limit exceed කළා!*

Video too long. Shorter clip එකක් try කරන්න.`
            );
        }

        // ── Step 4: Send කරනවා ────────────────────────────────────────────
        await reply(`📤 *Uploading ${finalMB}MB...*`);

        await conn.sendMessage(m.from, {
            video: fs.readFileSync(tmpFinal),
            caption:
`🎬 *${title}*
👤 ${uploader}
⏱️ ${durationMin}m ${durationSec}s
📦 ${finalMB}MB

> _NOVA-MD Video Downloader_`,
            mimetype: 'video/mp4'
        }, { quoted: mek });

    } catch (err) {
        console.error('[VDL ERROR]', err.message);
        await reply(`❌ Error: ${err.message}`);
    } finally {
        if (fs.existsSync(tmpRaw))   fs.unlinkSync(tmpRaw);
        if (fs.existsSync(tmpFinal)) fs.unlinkSync(tmpFinal);
    }
});
