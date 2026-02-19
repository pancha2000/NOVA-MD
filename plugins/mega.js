// plugins/mega.js
const { cmd } = require('../lib/commands');
const { File } = require('megajs');
const fs = require('fs');
const path = require('path');
const { getRandom } = require('../lib/functions');

cmd({
    pattern: "mega",
    desc: "Download files from mega.nz links and send as document (supports up to 2GB)",
    category: "download",
    react: "📥",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    let downloadPath = null;
    try {
        if (!q) {
            return reply("❌ කරුණාකර mega.nz link එකක් දෙන්න.\nඋදා: .mega https://mega.nz/file/abc123");
        }

        // Mega link එක parse කරනවා
        let file;
        try {
            file = File.fromURL(q);
        } catch (e) {
            return reply("❌ වැරදි mega.nz link එකක්.");
        }

        await reply("⏳ File එක mega වලින් download කරනවා... මෙය විනාඩියක් පමණ ගත විය හැක.");

        // Temporary file name එකක් හදනවා
        const fileName = file.name || `mega_${Date.now()}`;
        const fileExt = path.extname(fileName);
        const randomName = getRandom(fileExt || '.bin');
        
        // tmp folder එකට download කරන්න
        const tmpDir = path.join(__dirname, '../tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        downloadPath = path.join(tmpDir, randomName);

        // File එක download කරනවා
        const fileStream = fs.createWriteStream(downloadPath);
        const downloadStream = file.download();

        downloadStream.pipe(fileStream);

        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
            downloadStream.on('error', reject);
        });

        const stats = fs.statSync(downloadPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        // 2GB ට වැඩිද check එකක් (WhatsApp document limit එක 2GB පමණ)
        if (stats.size > 2 * 1024 * 1024 * 1024) {
            fs.unlinkSync(downloadPath);
            return reply("❌ File එක 2GB ට වැඩියි. WhatsApp වලට document විදියටවත් එවන්න බැහැ.");
        }

        // සාමාන්‍ය පණිවිඩය
        let caption = `📥 *Mega Download Complete*\n\n📁 *File:* ${fileName}\n📦 *Size:* ${fileSizeMB} MB\n📤 *Sent as:* Document`;
        
        // File type එක අනුව mimetype එක හදාගන්න
        const mimeType = require('mime-types').lookup(fileExt) || 'application/octet-stream';
        
        // **Document විදියටම send කරනවා (කොච්චර ලොකු වුණත්)**
        await conn.sendMessage(from, { 
            document: fs.readFileSync(downloadPath), 
            mimetype: mimeType,
            fileName: fileName,
            caption: caption
        }, { quoted: mek });

        // File එක delete කරනවා (send කරපු ගමන්)
        fs.unlinkSync(downloadPath);
        downloadPath = null;

    } catch (e) {
        console.error("Mega download error:", e);
        reply(`❌ දෝෂයක්: ${e.message}`);
        
        // Temp file එක තියෙනවා නම් delete කරනවා
        try {
            if (downloadPath && fs.existsSync(downloadPath)) {
                fs.unlinkSync(downloadPath);
            }
        } catch (err) {}
    }
});