/**
 * APEX-MD V2 - Utility Functions
 * serialize() is now in index.js directly for clarity.
 * This file keeps helpers used by plugins.
 */

'use strict';

const axios = require('axios');

/** Buffer from URL */
async function getBuffer(url, options = {}) {
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers },
            ...options
        });
        return res.data;
    } catch (e) {
        console.log('getBuffer error:', e.message);
        return null;
    }
}

/** JSON from URL */
async function fetchJson(url, options = {}) {
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers },
            ...options
        });
        return res.data;
    } catch (e) {
        console.log('fetchJson error:', e.message);
        return null;
    }
}

/** Sleep */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Human-readable uptime */
function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ');
}

/** Check URL */
function isUrl(str) {
    return /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/.test(str);
}

/** Random filename */
function getRandom(ext) {
    return `${Math.floor(Math.random() * 1_000_000)}${ext}`;
}

/** Format number with commas */
function formatNumber(n) {
    return Number(n).toLocaleString('en-US');
}

module.exports = { getBuffer, fetchJson, sleep, runtime, isUrl, getRandom, formatNumber };
