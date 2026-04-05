'use strict';

const axios = require('axios');

function runtime(sec) {
    sec = Math.floor(Number(sec));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`]
        .filter(Boolean).join(' ');
}

async function getBuffer(url) {
    try {
        const r = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(r.data);
    } catch { return null; }
}

async function fetchJson(url) {
    try {
        const r = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return r.data;
    } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { runtime, getBuffer, fetchJson, sleep };
