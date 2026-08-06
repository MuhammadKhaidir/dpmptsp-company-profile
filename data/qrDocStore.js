// data/qrDocStore.js
//
// Penyimpanan "dokumen terkait" per kotak QR -- ini yang dipakai tombol
// "Lihat Dokumen Terkait" di modal pilihan buat nentuin diarahkan ke mana
// pas diklik. BEDA dari qrImageStore.js (gambar kode QR itu sendiri) dan
// qrBgStore.js (gambar latar hover) -- independen, gak saling ganggu,
// ngikutin pola yang sama persis: metadata di Upstash Redis, berkas
// (kalau PDF) di Vercel Blob.
//
// Dua mode per slot:
//   - 'link' -> arahkan ke URL eksternal apa aja (website, dsb).
//   - 'pdf'  -> berkas PDF yang di-upload, disimpan di Vercel Blob.
// Kalau belum pernah diisi (mode null / belum ada entry), front-end
// otomatis fallback ke perilaku lama: scroll ke halaman flip book yang
// sesuai.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const SLOTS = ['left', 'center', 'right'];

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function keyFor(slot) {
    return `qr-doc:${slot}`;
}

// entry: { mode: 'link' | 'pdf', url, pathname (cuma diisi buat mode 'pdf',
// dipakai buat hapus blob lama), updatedAt }
async function getSlotDoc(slot) {
    if (!isValidSlot(slot)) return null;
    return getJSON(keyFor(slot));
}

async function setSlotDocLink(slot, url) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotDoc(slot);

    const entry = {
        mode: 'link',
        url,
        pathname: null,
        updatedAt: Date.now()
    };

    await setJSON(keyFor(slot), entry);

    // Kalau sebelumnya mode 'pdf', blob lama udah gak kepake -- hapus biar
    // gak numpuk sampah di storage. Gak di-await biar respons gak nunggu.
    if (prev && prev.mode === 'pdf' && prev.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[qrDocStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return entry;
}

// params: { buffer, mimeType, ext }
async function setSlotDocFile(slot, { buffer, mimeType, ext }) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotDoc(slot);

    const blob = await put(`qr-docs/${slot}-${Date.now()}.${ext}`, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: true
    });

    const entry = {
        mode: 'pdf',
        url: blob.url,
        pathname: blob.pathname,
        updatedAt: Date.now()
    };

    await setJSON(keyFor(slot), entry);

    if (prev && prev.mode === 'pdf' && prev.pathname && prev.pathname !== blob.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[qrDocStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return entry;
}

async function clearSlotDoc(slot) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);

    const prev = await getSlotDoc(slot);
    await delKey(keyFor(slot));

    if (prev && prev.mode === 'pdf' && prev.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[qrDocStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return null;
}

async function getMeta() {
    const meta = {};
    await Promise.all(SLOTS.map(async (slot) => {
        const entry = await getSlotDoc(slot);
        meta[slot] = entry
            ? { mode: entry.mode, url: entry.url, updatedAt: entry.updatedAt }
            : { mode: null, url: null, updatedAt: null };
    }));
    return meta;
}

module.exports = {
    SLOTS,
    isValidSlot,
    getSlotDoc,
    setSlotDocLink,
    setSlotDocFile,
    clearSlotDoc,
    getMeta
};