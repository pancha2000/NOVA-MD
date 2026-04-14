const fs = require('fs');

// Load .env file
if (fs.existsSync('./config.env')) {
    require('dotenv').config({ path: './config.env' });
}

const config = {
    // ==================== BOT INFO ====================
    SESSION_ID:        process.env.SESSION_ID        || '',
    BOT_NAME:          process.env.BOT_NAME          || 'NOVA-MD',
    VERSION:           process.env.VERSION           || '1.0.0',

    // ==================== PAIRING ====================
    USE_PAIRING_CODE:  process.env.USE_PAIRING_CODE  || 'false',
    PHONE_NUMBER:      process.env.PHONE_NUMBER       || '',

    // ==================== DATABASE ====================
    MONGODB:           process.env.MONGODB           || '',

    // ==================== BOT SETTINGS ====================
    PREFIX:            process.env.PREFIX            || '.',
    MODE:              process.env.MODE              || 'public',
    AUTO_READ:         process.env.AUTO_READ         || 'true',
    AUTO_STATUS_READ:  process.env.AUTO_STATUS_READ  || 'false',
    AUTO_TYPING:       process.env.AUTO_TYPING       || 'false',
    AUTO_RECORDING:    process.env.AUTO_RECORDING    || 'false',

    // ==================== OWNER INFO ====================
    OWNER_NAME:        process.env.OWNER_NAME        || 'Owner',
    OWNER_NUMBER:      process.env.OWNER_NUMBER      || '',
    SUDO:              process.env.SUDO              || '',

    // ==================== ALIVE & MENU ====================
    ALIVE_IMG:         process.env.ALIVE_IMG         || '',
    ALIVE_MSG:         process.env.ALIVE_MSG         || '✅ *NOVA-MD IS ONLINE*',
    MENU_IMG:          process.env.MENU_IMG          || '',

    // ==================== API KEYS ====================
    GEMINI_API:        process.env.GEMINI_API        || '',
    OPENAI_API:        process.env.OPENAI_API        || '',

    // ==================== MEGA.NZ ====================
    MEGA_EMAIL:        process.env.MEGA_EMAIL        || '',
    MEGA_PASSWORD:     process.env.MEGA_PASSWORD     || '',

    // ==================== GOOGLE DRIVE ====================
    GDRIVE_CLIENT_ID:      process.env.GDRIVE_CLIENT_ID      || '',
    GDRIVE_CLIENT_SECRET:  process.env.GDRIVE_CLIENT_SECRET  || '',
    GDRIVE_REFRESH_TOKEN:  process.env.GDRIVE_REFRESH_TOKEN  || '',
    GDRIVE_FOLDER_ID:      process.env.GDRIVE_FOLDER_ID      || '',

    // ==================== GROUP SETTINGS ====================
    ANTILINK_ENABLED:  process.env.ANTILINK_ENABLED  || 'true',
    ANTILINK_ACTION:   process.env.ANTILINK_ACTION   || 'kick',
    WELCOME_ENABLED:   process.env.WELCOME_ENABLED   || 'true',
    GOODBYE_ENABLED:   process.env.GOODBYE_ENABLED   || 'true',

    // ==================== SECURITY ====================
    BLOCK_SPAM:        process.env.BLOCK_SPAM        || 'true',
    SPAM_COUNT:        parseInt(process.env.SPAM_COUNT) || 5,
    BAN_TIME:          parseInt(process.env.BAN_TIME)   || 3600,
    ANTI_CALL:         process.env.ANTI_CALL         || 'false',

    // ==================== OTHER ====================
    PORT:              process.env.PORT              || 8000,
    TIME_ZONE:         process.env.TIME_ZONE         || 'Asia/Colombo',
    DEBUG:             process.env.DEBUG             || 'false',
    LOGS:              process.env.LOGS              || 'true',
};

// Helper: check owner/sudo
config.isOwner = (jid) => {
    const number = jid.split('@')[0];
    const sudoList = (config.SUDO || config.OWNER_NUMBER)
        .split(',')
        .map(n => n.trim())
        .filter(Boolean);
    return sudoList.includes(number);
};

if (!config.SESSION_ID) {
    console.log('⚠️  SESSION_ID නැහැ! config.env file එකේ add කරන්න.');
}

module.exports = config;
