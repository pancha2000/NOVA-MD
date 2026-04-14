const { jidNormalizedUser, getContentType } = require('@whiskeysockets/baileys');

const serialize = async (mek, conn) => {
    try {
        if (!mek) return null;

        // ── Unwrap wrapper message types ──────────────────────────────────
        // Newer WhatsApp sends messages wrapped inside ephemeral/viewOnce etc.
        let message = mek.message;
        if (!message) return null;

        const WRAPPER_TYPES = [
            'ephemeralMessage',
            'viewOnceMessage',
            'viewOnceMessageV2',
            'viewOnceMessageV2Extension',
            'documentWithCaptionMessage',
            'editedMessage',
        ];

        // Unwrap nested message
        for (const wrapper of WRAPPER_TYPES) {
            if (message[wrapper]?.message) {
                message = message[wrapper].message;
                break;
            }
        }

        const type = getContentType(message);
        if (!type) return null;

        const msg  = message[type];
        const from = mek.key.remoteJid;
        const isGroup = from?.endsWith('@g.us');

        let body = '';
        if      (type === 'conversation')                    body = message.conversation || '';
        else if (type === 'extendedTextMessage')             body = msg?.text || '';
        else if (type === 'imageMessage')                    body = msg?.caption || '';
        else if (type === 'videoMessage')                    body = msg?.caption || '';
        else if (type === 'documentMessage')                 body = msg?.caption || '';
        else if (type === 'buttonsResponseMessage')          body = msg?.selectedButtonId || '';
        else if (type === 'listResponseMessage')             body = msg?.singleSelectReply?.selectedRowId || '';
        else if (type === 'templateButtonReplyMessage')      body = msg?.selectedId || '';
        else                                                  body = '';

        const sender = isGroup
            ? (mek.key.participant || mek.participant || '')
            : mek.key.fromMe
                ? (conn.user?.id || '')
                : from;

        return {
            key:          mek.key,
            id:           mek.key.id,
            from,
            isGroup,
            sender:       jidNormalizedUser(sender || ''),
            pushName:     mek.pushName || '',
            message:      message,       // unwrapped message
            type,
            body,
            quoted:       msg?.contextInfo?.quotedMessage || null,
            mentionedJid: msg?.contextInfo?.mentionedJid || [],
            isOwner:      false,
            timestamp:    mek.messageTimestamp
        };

    } catch (e) {
        console.log('Serialize error:', e.message);
        return null;
    }
};

const runtime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
};

module.exports = { serialize, runtime };
