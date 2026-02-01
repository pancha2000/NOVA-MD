const { cmd } = require('../lib/commands');
const config = require('../config');

// Helper function to get bot number
function getBotNumber(conn) {
    try {
        if (conn.user?.id) {
            return conn.user.id.split(":")[0] + "@s.whatsapp.net";
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Helper function to check admin
function isAdmin(participants, jid) {
    const participant = participants.find(p => p.phoneNumber === jid || p.id === jid);
    return participant?.admin ? true : false;
}

// Advanced test add command
cmd({
    pattern: "testadd2",
    desc: "Advanced test for add command",
    category: "test",
    react: "🧪",
    isGroup: true,
    filename: __filename
},
async (conn, mek, m, { reply, text }) => {
    try {
        console.log("\n" + "=".repeat(60));
        console.log("ADVANCED ADD COMMAND TEST");
        console.log("=".repeat(60));
        
        // Step 1: Get group metadata
        console.log("\n[1] Fetching group metadata...");
        const groupMetadata = await conn.groupMetadata(m.from);
        const participants = groupMetadata.participants;
        
        console.log("✓ Group ID:", m.from);
        console.log("✓ Total participants:", participants.length);
        console.log("✓ Group subject:", groupMetadata.subject);
        
        // Step 2: Check bot info
        console.log("\n[2] Checking bot information...");
        const botNumber = getBotNumber(conn);
        console.log("✓ Bot Number:", botNumber);
        console.log("✓ Bot user object:", JSON.stringify(conn.user, null, 2));
        
        // Step 3: Check admin status
        console.log("\n[3] Checking admin status...");
        const botAdmin = isAdmin(participants, botNumber);
        const userAdmin = isAdmin(participants, m.sender);
        
        console.log("✓ Bot is admin:", botAdmin);
        console.log("✓ User is admin:", userAdmin);
        console.log("✓ User is owner:", config.isOwner(m.sender));
        
        // Step 4: Validate permissions
        if (!botAdmin) {
            console.log("✗ FAILED: Bot is not admin");
            return await reply('❌ Bot admin නෙවෙයි!');
        }
        
        if (!userAdmin && !config.isOwner(m.sender)) {
            console.log("✗ FAILED: User is not admin");
            return await reply('❌ ඔබ admin නෙවෙයි!');
        }
        
        // Step 5: Validate input
        if (!text) {
            console.log("✗ FAILED: No number provided");
            return await reply('❌ කරුණාකර number එකක් දෙන්න!\n\nExample: .testadd2 94xxxxxxxxx');
        }
        
        console.log("\n[4] Processing number...");
        let number = text.replace(/[^0-9]/g, '');
        
        if (!number.startsWith('94')) {
            number = '94' + number;
        }
        
        const jid = number + '@s.whatsapp.net';
        console.log("✓ Formatted JID:", jid);
        
        // Step 6: Check if number is already in group
        console.log("\n[5] Checking if number is already in group...");
        const alreadyInGroup = participants.some(p => 
            p.phoneNumber === jid || p.id === jid
        );
        
        if (alreadyInGroup) {
            console.log("! WARNING: Number already in group");
            await reply(`⚠️ ${number} දැනටමත් group එකේ ඉන්නවා!`);
            return;
        }
        
        console.log("✓ Number not in group, proceeding...");
        
        // Step 7: Attempt to add
        console.log("\n[6] Attempting to add participant...");
        console.log("Parameters:");
        console.log("  - Group JID:", m.from);
        console.log("  - User JID:", jid);
        console.log("  - Action: 'add'");
        
        await m.react('⏳');
        
        try {
            console.log("\n[7] Calling groupParticipantsUpdate...");
            const startTime = Date.now();
            
            const result = await conn.groupParticipantsUpdate(m.from, [jid], 'add');
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log("\n✓ ADD SUCCESSFUL!");
            console.log("Duration:", duration + "ms");
            console.log("Result object:", JSON.stringify(result, null, 2));
            console.log("Result type:", typeof result);
            console.log("Result is array:", Array.isArray(result));
            
            if (Array.isArray(result) && result.length > 0) {
                console.log("First result item:", JSON.stringify(result[0], null, 2));
            }
            
            await reply(`✅ *ADD SUCCESSFUL!*\n\n` +
                       `📱 Number: ${number}\n` +
                       `⏱️ Duration: ${duration}ms\n` +
                       `📊 Result: ${JSON.stringify(result)}`);
            await m.react('✅');
            
        } catch (addError) {
            console.log("\n✗ ADD FAILED!");
            console.log("Error name:", addError.name);
            console.log("Error message:", addError.message);
            console.log("Error stack:", addError.stack);
            console.log("Full error object:", JSON.stringify(addError, Object.getOwnPropertyNames(addError), 2));
            
            await reply(`❌ *ADD FAILED!*\n\n` +
                       `🐛 Error: ${addError.message}\n\n` +
                       `Check terminal/console for full details.`);
            await m.react('❌');
        }
        
        console.log("\n" + "=".repeat(60));
        console.log("TEST COMPLETED");
        console.log("=".repeat(60) + "\n");
        
    } catch (e) {
        console.log("\n✗ FATAL ERROR!");
        console.log("Error:", e);
        await m.react('❌');
        await reply('❌ Fatal Error: ' + e.message);
    }
});

// Advanced test kick command
cmd({
    pattern: "testkick2",
    desc: "Advanced test for kick command",
    category: "test",
    react: "🧪",
    isGroup: true,
    filename: __filename
},
async (conn, mek, m, { reply }) => {
    try {
        console.log("\n" + "=".repeat(60));
        console.log("ADVANCED KICK COMMAND TEST");
        console.log("=".repeat(60));
        
        const groupMetadata = await conn.groupMetadata(m.from);
        const participants = groupMetadata.participants;
        const botNumber = getBotNumber(conn);
        const botAdmin = isAdmin(participants, botNumber);
        const userAdmin = isAdmin(participants, m.sender);

        console.log("\n[1] Bot is admin:", botAdmin);
        console.log("[2] User is admin:", userAdmin);

        if (!botAdmin) {
            return await reply('❌ Bot admin නෙවෙයි!');
        }

        if (!userAdmin && !config.isOwner(m.sender)) {
            return await reply('❌ ඔබ admin නෙවෙයි!');
        }

        if (!m.quoted && !m.mentionedJid?.length) {
            return await reply('❌ Kick කරන්න ඕනේ කෙනාව mention කරන්න හෝ reply කරන්න!');
        }

        const user = m.quoted ? m.quoted.sender : m.mentionedJid[0];
        
        console.log("\n[3] Target user:", user);

        // Check if target is admin
        const targetAdmin = isAdmin(participants, user);
        console.log("[4] Target is admin:", targetAdmin);
        
        if (targetAdmin) {
            return await reply('❌ Admin කෙනෙක් remove කරන්න බැහැ!');
        }

        console.log("\n[5] Attempting to kick...");
        console.log("Parameters:");
        console.log("  - Group JID:", m.from);
        console.log("  - User JID:", user);
        console.log("  - Action: 'remove'");

        await m.react('⏳');

        try {
            const startTime = Date.now();
            
            const result = await conn.groupParticipantsUpdate(m.from, [user], 'remove');
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log("\n✓ KICK SUCCESSFUL!");
            console.log("Duration:", duration + "ms");
            console.log("Result:", JSON.stringify(result, null, 2));
            
            await reply(`✅ *KICK SUCCESSFUL!*\n\n` +
                       `👤 User: @${user.split('@')[0]}\n` +
                       `⏱️ Duration: ${duration}ms\n` +
                       `📊 Result: ${JSON.stringify(result)}`);
            await m.react('✅');
            
        } catch (kickError) {
            console.log("\n✗ KICK FAILED!");
            console.log("Error:", kickError);
            console.log("Full error:", JSON.stringify(kickError, Object.getOwnPropertyNames(kickError), 2));
            
            await reply(`❌ *KICK FAILED!*\n\n` +
                       `🐛 Error: ${kickError.message}\n\n` +
                       `Check terminal for details.`);
            await m.react('❌');
        }
        
        console.log("\n" + "=".repeat(60) + "\n");

    } catch (e) {
        console.log("\n✗ FATAL ERROR:", e);
        await m.react('❌');
        await reply('❌ Error: ' + e.message);
    }
});
