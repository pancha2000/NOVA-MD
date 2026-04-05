const { jidNormalizedUser, getContentType } = require('@whiskeysockets/baileys');

const serialize = async (mek, conn) => {
    try {
        if (!mek) return null;
        
        const type = getContentType(mek.message);
        if (!type) return null;
        
        const msg = mek.message[type];
        const from = mek.key.remoteJid;
        const isGroup = from?.endsWith('@g.us');
        
        let body = '';
        if (type === 'conversation') body = mek.message.conversation;
        else if (type === 'extendedTextMessage') body = msg?.text || '';
        else if (type === 'imageMessage') body = msg?.caption || '';
        else if (type === 'videoMessage') body = msg?.caption || '';
        else if (type === 'buttonsResponseMessage') body = msg?.selectedButtonId || '';
        else if (type === 'listResponseMessage') body = msg?.singleSelectReply?.selectedRowId || '';
        else if (type === 'templateButtonReplyMessage') body = msg?.selectedId || '';
        
        const sender = isGroup ?
            mek.key.participant || mek.participant :
            mek.key.fromMe ?
            (conn.user?.id || '') :
            from;
        
        return {
            key: mek.key,
            id: mek.key.id,
            from,
            isGroup,
            sender: jidNormalizedUser(sender || ''),
            pushName: mek.pushName || '',
            message: mek.message,
            type,
            body,
            quoted: msg?.contextInfo?.quotedMessage || null,
            mentionedJid: msg?.contextInfo?.mentionedJid || [],
            isOwner: false,
            timestamp: mek.messageTimestamp
        };
    } catch (e) {
        console.log('Serialize error:', e.message);
        return null;
    }
};

module.exports = { serialize };