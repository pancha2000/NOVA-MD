const mongoose = require('mongoose');
const config = require('../config');

// ── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
    jid:          { type: String, required: true, unique: true },
    name:         { type: String, default: 'User' },
    banned:       { type: Boolean, default: false },
    banExpiry:    { type: Date },
    warnings:     { type: Number, default: 0 },
    premium:      { type: Boolean, default: false },
    coins:        { type: Number, default: 0 },
    xp:           { type: Number, default: 0 },
    level:        { type: Number, default: 1 },
    commandsUsed: { type: Number, default: 0 },
    lastSeen:     { type: Date, default: Date.now },
    createdAt:    { type: Date, default: Date.now }
});

const groupSchema = new mongoose.Schema({
    jid:            { type: String, required: true, unique: true },
    name:           { type: String, required: true },
    antilink:       { type: Boolean, default: false },
    antilinkAction: { type: String, default: 'kick', enum: ['kick', 'warn', 'delete'] },
    welcome:        { type: Boolean, default: false },
    goodbye:        { type: Boolean, default: false },
    welcomeMessage: { type: String, default: '👋 Welcome @user to @group!' },
    goodbyeMessage: { type: String, default: '👋 Goodbye @user!' },
    mute:           { type: Boolean, default: false },
    createdAt:      { type: Date, default: Date.now }
});

const warningSchema = new mongoose.Schema({
    userJid:  { type: String, required: true },
    groupJid: { type: String, required: true },
    reason:   { type: String, required: true },
    warnedBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const commandUsageSchema = new mongoose.Schema({
    command:  { type: String, required: true },
    userJid:  { type: String, required: true },
    groupJid: { type: String },
    timestamp: { type: Date, default: Date.now }
});

const User         = mongoose.model('User',         userSchema);
const Group        = mongoose.model('Group',        groupSchema);
const Warning      = mongoose.model('Warning',      warningSchema);
const CommandUsage = mongoose.model('CommandUsage', commandUsageSchema);

// ── Connection ────────────────────────────────────────────────────────────────

async function connectDB() {
    if (!config.MONGODB) {
        console.log('⚠️  MongoDB URL නැහැ. Database features disable.');
        return false;
    }
    try {
        await mongoose.connect(config.MONGODB);
        console.log('✅ MongoDB connected!');
        return true;
    } catch (e) {
        console.log('❌ MongoDB error:', e.message);
        return false;
    }
}

// ── User helpers ──────────────────────────────────────────────────────────────

async function getUser(jid) {
    try { return await User.findOne({ jid }); } catch { return null; }
}

async function updateUser(jid, data) {
    try {
        return await User.findOneAndUpdate({ jid }, data, { upsert: true, new: true });
    } catch { return null; }
}

// ── Group helpers ─────────────────────────────────────────────────────────────

async function getGroup(jid) {
    try { return await Group.findOne({ jid }); } catch { return null; }
}

async function updateGroup(jid, data) {
    try {
        return await Group.findOneAndUpdate({ jid }, data, { upsert: true, new: true });
    } catch { return null; }
}

// ── Warning helpers ───────────────────────────────────────────────────────────

async function addWarning(userJid, groupJid, reason, warnedBy) {
    try {
        const w = new Warning({ userJid, groupJid, reason, warnedBy });
        return await w.save();
    } catch { return null; }
}

async function getWarnings(userJid, groupJid) {
    try { return await Warning.find({ userJid, groupJid }); } catch { return []; }
}

async function clearWarnings(userJid, groupJid) {
    try { return await Warning.deleteMany({ userJid, groupJid }); } catch { return null; }
}

// ── Command log ───────────────────────────────────────────────────────────────

async function logCommand(command, userJid, groupJid = null) {
    try {
        const cu = new CommandUsage({ command, userJid, groupJid });
        return await cu.save();
    } catch { return null; }
}

module.exports = {
    connectDB,
    getUser, updateUser,
    getGroup, updateGroup,
    addWarning, getWarnings, clearWarnings,
    logCommand
};
