const { cmd } = require('../lib/commands');
const config = require('../config');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

// Helper function to generate random filename
function getRandom(ext) {
    return `${Math.floor(Math.random() * 10000)}${ext}`;
}

cmd({
    pattern: "song",
    alias: ["play", "yt", "ytmp3"],
    desc: "Download YouTube songs",
    category: "downloads",
    react: "🎵",
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        if (!text) {
            return await reply('❌ කරුණාකර song name එකක් දෙන්න!\n\nExample: .song faded');
        }

        await m.react('🔎');
        
        // Search YouTube
        const search = await yts(text);
        const video = search.videos[0];
        
        if (!video) {
            await m.react('❌');
            return await reply('❌ Song එකක් හොයාගන්න බැරි වුණා!');
        }

        // Check duration (max 10 minutes)
        const duration = video.seconds;
        if (duration > 600) {
            await m.react('❌');
            return await reply('❌ Song එක ලොකු වැඩියි! (Max: 10 minutes)');
        }

        await m.react('⏳');

        // Send info message
        const infoMsg = `
╔═══════════════════════════╗
║   🎵 *SONG DOWNLOADER*    ║
╚═══════════════════════════╝

📌 *Title:* ${video.title}
⏱️ *Duration:* ${video.timestamp}
👁️ *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}
🔗 *URL:* ${video.url}

⏳ *Downloading...*
`;

        await conn.sendMessage(m.from, {
            image: { url: video.thumbnail },
            caption: infoMsg
        }, { quoted: mek });

        // Download audio with better options to avoid bot detection
        const stream = ytdl(video.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            }
        });

        const fileName = getRandom('.mp3');
        const filePath = `./temp/${fileName}`;

        // Ensure temp directory exists
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp', { recursive: true });
        }

        const file = fs.createWriteStream(filePath);
        stream.pipe(file);

        await new Promise((resolve, reject) => {
            file.on('finish', resolve);
            file.on('error', reject);
            stream.on('error', reject);
        });

        // Send audio
        await conn.sendMessage(m.from, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            fileName: `${video.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: video.title,
                    body: `APEX-MD V2 | ${video.timestamp}`,
                    thumbnail: await (await fetch(video.thumbnail)).buffer(),
                    mediaType: 1,
                    mediaUrl: video.url,
                    sourceUrl: video.url
                }
            }
        }, { quoted: mek });

        await m.react('✅');

        // Cleanup
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (cleanupError) {
            console.log('Cleanup error:', cleanupError);
        }

    } catch (e) {
        await m.react('❌');
        console.log('Song download error:', e);
        
        // Better error messages
        if (e.message.includes('Sign in')) {
            await reply('❌ YouTube bot protection detect කරලා තියෙනවා. පස්සේ try කරන්න හෝ වෙනත් song එකක් try කරන්න.');
        } else if (e.message.includes('private')) {
            await reply('❌ මේ video එක private හෝ age-restricted!');
        } else {
            await reply('❌ Download error: ' + e.message);
        }
    }
});

// Video download command
cmd({
    pattern: "video",
    alias: ["ytmp4", "ytvideo"],
    desc: "Download YouTube videos",
    category: "downloads",
    react: "🎥",
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        if (!text) {
            return await reply('❌ කරුණාකර video name එකක් දෙන්න!\n\nExample: .video faded');
        }

        await m.react('🔎');
        
        // Search YouTube
        const search = await yts(text);
        const video = search.videos[0];
        
        if (!video) {
            await m.react('❌');
            return await reply('❌ Video එකක් හොයාගන්න බැරි වුණා!');
        }

        // Check duration (max 15 minutes for video)
        const duration = video.seconds;
        if (duration > 900) {
            await m.react('❌');
            return await reply('❌ Video එක ලොකු වැඩියි! (Max: 15 minutes)');
        }

        await m.react('⏳');

        // Send info message
        const infoMsg = `
╔═══════════════════════════╗
║   🎥 *VIDEO DOWNLOADER*   ║
╚═══════════════════════════╝

📌 *Title:* ${video.title}
⏱️ *Duration:* ${video.timestamp}
👁️ *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}
🔗 *URL:* ${video.url}

⏳ *Downloading...*
⚠️ Video size අනුව time ටිකක් යයි
`;

        await conn.sendMessage(m.from, {
            image: { url: video.thumbnail },
            caption: infoMsg
        }, { quoted: mek });

        // Download video (360p to avoid size issues)
        const stream = ytdl(video.url, {
            quality: '18', // 360p
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            }
        });

        const fileName = getRandom('.mp4');
        const filePath = `./temp/${fileName}`;

        // Ensure temp directory exists
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp', { recursive: true });
        }

        const file = fs.createWriteStream(filePath);
        stream.pipe(file);

        await new Promise((resolve, reject) => {
            file.on('finish', resolve);
            file.on('error', reject);
            stream.on('error', reject);
        });

        // Check file size (max 100MB for WhatsApp)
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 100) {
            fs.unlinkSync(filePath);
            await m.react('❌');
            return await reply('❌ Video එක ලොකු වැඩියි WhatsApp එකට! (100MB+)\n\nකෙටි video එකක් try කරන්න.');
        }

        // Send video
        await conn.sendMessage(m.from, {
            video: { url: filePath },
            caption: `🎥 *${video.title}*\n\n⏱️ ${video.timestamp} | 👁️ ${video.views.toLocaleString()}\n\n_APEX-MD V2_`,
            mimetype: 'video/mp4'
        }, { quoted: mek });

        await m.react('✅');

        // Cleanup
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (cleanupError) {
            console.log('Cleanup error:', cleanupError);
        }

    } catch (e) {
        await m.react('❌');
        console.log('Video download error:', e);
        
        // Better error messages
        if (e.message.includes('Sign in')) {
            await reply('❌ YouTube bot protection detect කරලා තියෙනවා. පස්සේ try කරන්න හෝ වෙනත් video එකක් try කරන්න.');
        } else if (e.message.includes('private')) {
            await reply('❌ මේ video එක private හෝ age-restricted!');
        } else {
            await reply('❌ Download error: ' + e.message);
        }
    }
});
