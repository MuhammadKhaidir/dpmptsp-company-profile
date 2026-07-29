// data/musicStore.js
//
// Penyimpanan lagu untuk lingkungan SERVERLESS (Vercel), pola sama persis
// dengan data/qrImageStore.js:
// - Berkas audio -> Vercel Blob
// - Metadata (judul, url, waktu update) -> Upstash Redis

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const SLOTS = ['slot1', 'slot2', 'slot3'];

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function keyFor(slot) {
    return `music:${slot}`;
}

// entry: { url, pathname, mimeType, title, updatedAt }
async function getSlotTrack(slot) {
    if (!isValidSlot(slot)) return null;
    return getJSON(keyFor(slot));
}

// params: { buffer, mimeType, ext, title }
async function setSlotTrack(slot, { buffer, mimeType, ext, title }) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotTrack(slot);

    const blob = await put(`music/${slot}-${Date.now()}.${ext}`, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: true
    });

    const entry = {
        url: blob.url,
        pathname: blob.pathname,
        mimeType,
        title,
        updatedAt: Date.now()
    };

    await setJSON(keyFor(slot), entry);

    if (prev && prev.pathname && prev.pathname !== blob.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[musicStore] Gagal hapus blob lama:', err);
        });
    }

    return entry;
}

async function clearSlotTrack(slot) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const prev = await getSlotTrack(slot);
    if (prev && prev.pathname) {
        await del(prev.pathname).catch((err) => {
            console.error('[musicStore] Gagal hapus blob:', err);
        });
    }
    await delKey(keyFor(slot));
}

async function getPublicList() {
    const list = [];
    for (const slot of SLOTS) {
        const entry = await getSlotTrack(slot);
        if (entry) {
            list.push({ slot, title: entry.title || 'Tanpa Judul', updatedAt: entry.updatedAt });
        }
    }
    return list;
}

module.exports = {
    SLOTS,
    isValidSlot,
    getSlotTrack,
    setSlotTrack,
    clearSlotTrack,
    getPublicList
};