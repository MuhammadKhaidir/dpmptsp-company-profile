// data/qrImageStore.js
//
// Penyimpanan gambar QR untuk lingkungan SERVERLESS (Vercel).
//
// Kenapa diubah dari versi sebelumnya (yang nulis ke disk lokal via `fs`):
// Vercel Functions punya filesystem READ-ONLY (kecuali /tmp, dan /tmp pun
// ephemeral -- gak permanen, bisa ilang kapan aja). Versi lama didesain
// buat Fly.io (volume persisten di /data), jadi begitu di-deploy ke Vercel,
// setiap kali route ini nyoba fs.mkdirSync/fs.writeFileSync bakal throw
// EROFS -- dan karena throw-nya kejadian di dalam callback async, Express
// gak sempat nangkep, function-nya crash sebelum sempat kirim response
// (persis gejala net::ERR_EMPTY_RESPONSE di browser).
//
// Solusinya:
// - Berkas gambar   -> disimpan di Vercel Blob (object storage, bukan disk).
// - Metadata (judul, url gambar saat ini, waktu update) -> Upstash Redis.
//
// Env vars yang WAJIB ada (otomatis ke-set kalau kamu connect lewat tab
// Storage di dashboard Vercel -- lihat instruksi di chat):
//   BLOB_READ_WRITE_TOKEN
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

const SLOTS = ['left', 'center', 'right'];

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function keyFor(slot) {
    return `qr-image:${slot}`;
}

// entry yang disimpan per slot: { url, pathname, mimeType, title, updatedAt }
async function getSlotImage(slot) {
    if (!isValidSlot(slot)) return null;
    return getJSON(keyFor(slot));
}

// params: { buffer, mimeType, ext, title?, description? }
// title/description cuma diubah kalau dikirim (undefined = value lama dipertahankan).
async function setSlotImage(slot, { buffer, mimeType, ext, title, description }) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotImage(slot);

    const blob = await put(`qr-images/${slot}-${Date.now()}.${ext}`, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: true
    });

    const entry = {
        url: blob.url,
        pathname: blob.pathname,
        mimeType,
        title: (title !== undefined ? title : (prev ? prev.title : null)) || null,
        description: (description !== undefined ? description : (prev ? prev.description : null)) || null,
        updatedAt: Date.now()
    };

    await setJSON(keyFor(slot), entry);

    // Hapus blob LAMA setelah yang baru berhasil disimpan -- biar kalau ada
    // yang gagal di tengah proses, gambar lama gak ilang percuma. Ini juga
    // gak di-await biar gak bikin response nunggu, cukup dicatat kalau gagal.
    if (prev && prev.pathname && prev.pathname !== blob.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[qrImageStore] Gagal hapus blob lama:', err);
        });
    }

    return entry;
}

async function setSlotTitle(slot, title, description) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const prev = await getSlotImage(slot);
    const entry = Object.assign(
        { url: null, pathname: null, mimeType: null, title: null, description: null },
        prev,
        {
            title: title !== undefined ? title : (prev ? prev.title : null),
            description: description !== undefined ? description : (prev ? prev.description : null),
            updatedAt: Date.now()
        }
    );
    await setJSON(keyFor(slot), entry);
    return entry;
}

async function getMeta() {
    const meta = {};
    await Promise.all(SLOTS.map(async (slot) => {
        const entry = await getSlotImage(slot);
        meta[slot] = entry
            ? { hasCustom: !!entry.url, url: entry.url, updatedAt: entry.updatedAt, title: entry.title || null, description: entry.description || null }
            : { hasCustom: false, url: null, updatedAt: null, title: null, description: null };
    }));
    return meta;
}

module.exports = {
    SLOTS,
    isValidSlot,
    getSlotImage,
    setSlotImage,
    setSlotTitle,
    getMeta
};