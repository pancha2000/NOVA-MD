'use strict';

require('dotenv').config({ path: './config.env' });

const cfg = {
    USE_PAIRING_CODE: process.env.USE_PAIRING_CODE === 'true',
    PHONE_NUMBER:     (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, ''),
    BOT_NAME:         process.env.BOT_NAME    || 'APEX-MD V2',
    PREFIX:           process.env.PREFIX      || '.',
    OWNER_NAME:       process.env.OWNER_NAME  || 'Owner',
    OWNER_NUMBER:     (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, ''),
    MONGODB:          process.env.MONGODB     || '',
    AUTO_READ:        process.env.AUTO_READ   === 'true',
    MODE:             process.env.MODE        || 'public',
    PORT:             parseInt(process.env.PORT) || 8000,
};

/** JID ගාන number check කරන්න */
cfg.isOwner = function (jid) {
    const num = jid.split('@')[0].split(':')[0];
    return num === cfg.OWNER_NUMBER;
};

module.exports = cfg;
