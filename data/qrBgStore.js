// data/qrBgStore.js
//
// Penyimpanan gambar LATAR BELAKANG (muncul redup di belakang kotak QR
// saat di-hover) untuk lingkungan SERVERLESS (Vercel). Mengikuti pola
// yang SAMA PERSIS dengan data/qrImageStore.js:
// - Berkas gambar -> Vercel Blob (object storage, bukan disk).
// - Metadata (url gambar saat ini, waktu update) -> Upstash Redis.
//
// Kenapa diubah dari versi lama (fs.writeFileSync ke DATA_DIR): versi itu
// didesain buat Fly.io (volume persisten), dan SELALU gagal (EROFS) di
// Vercel karena filesystem-nya read-only.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

const SLOTS = ['left', 'center', 'right'];

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function keyFor(slot) {
    return `qr-bg:${slot}`;
}

// entry: { url, pathname, mimeType, updatedAt }
async function getSlotImage(slot) {
    if (!isValidSlot(slot)) return null;
    return getJSON(keyFor(slot));
}

// params: { buffer, mimeType, ext }
async function setSlotImage(slot, { buffer, mimeType, ext }) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotImage(slot);

    const blob = await put(`qr-bg/${slot}-${Date.now()}.${ext}`, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: true
    });

    const entry = {
        url: blob.url,
        pathname: blob.pathname,
        mimeType,
        updatedAt: Date.now()
    };

    await setJSON(keyFor(slot), entry);

    // Hapus blob lama SETELAH yang baru berhasil tersimpan, biar kalau ada
    // yang gagal di tengah jalan, gambar lama gak ilang percuma.
    if (prev && prev.pathname && prev.pathname !== blob.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[qrBgStore] Gagal hapus blob lama:', err);
        });
    }

    return entry;
}

async function getMeta() {
    const meta = {};
    await Promise.all(SLOTS.map(async (slot) => {
        const entry = await getSlotImage(slot);
        meta[slot] = entry
            ? { hasCustom: true, url: entry.url, updatedAt: entry.updatedAt }
            : { hasCustom: false, url: null, updatedAt: null };
    }));
    return meta;
}

module.exports = {
    SLOTS,
    isValidSlot,
    getSlotImage,
    setSlotImage,
    getMeta
};