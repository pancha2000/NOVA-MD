const { cmd } = require('../lib/commands');
const config = require('../config');

cmd({
    pattern: "checkowner",
    desc: "Check if you are owner",
    category: "test",
    filename: __filename
},
async (conn, mek, m, { reply }) => {
    try {
        const senderNumber = m.sender.split('@')[0];
        const isOwner = config.isOwner(m.sender);
        
        console.log("\n=== OWNER CHECK DEBUG ===");
        console.log("Sender JID:", m.sender);
        console.log("Sender Number:", senderNumber);
        console.log("SUDO Config:", config.SUDO);
        console.log("SUDO List:", config.SUDO.split(',').map(n => n.trim()));
        console.log("Is Owner:", isOwner);
        console.log("========================\n");
        
        let msg = `🔍 *Owner Check Debug*\n\n`;
        msg += `📱 Your Number: ${senderNumber}\n`;
        msg += `👑 SUDO Numbers: ${config.SUDO}\n`;
        msg += `✅ Is Owner: ${isOwner ? 'YES' : 'NO'}\n\n`;
        
        if (isOwner) {
            msg += `🎉 ඔබ owner කෙනෙක්! Owner commands use කරන්න පුළුවන්.`;
        } else {
            msg += `❌ ඔබ owner කෙනෙක් නෙවෙයි.\n\n`;
            msg += `💡 Owner වෙන්න config.env file එකේ SUDO line එකට ඔයාගේ number එක add කරන්න:\n`;
            msg += `SUDO=${senderNumber}\n\n`;
            msg += `හෝ දැනටමත් තියන numbers එක්ක:\n`;
            msg += `SUDO=${config.SUDO},${senderNumber}`;
        }
        
        await reply(msg);
        
    } catch (e) {
        console.error("Check owner error:", e);
        await reply('❌ Error: ' + e.message);
    }
});
