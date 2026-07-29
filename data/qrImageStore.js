// data/qrImageStore.js
//
// Penyimpanan sederhana ("database" ringan berbasis file JSON) buat nyimpen
// info gambar QR yang di-upload lewat panel ganti-gambar. Sengaja PAKAI file
// JSON biasa, BUKAN MySQL/XAMPP -- karena datanya simpel banget (cuma path
// file + waktu update per slot), jadi gak butuh setup database server yang
// berat. File ini otomatis dibuat sendiri kalau belum ada.
//
// Lokasi file gambar yang di-upload disimpan di data/qr-uploads/, TIDAK di
// folder Assets/Video/ -- biar gambar asli/default kamu di Assets/Video/
// gak pernah ketimpa/ke-overwrite. Kalau slot belum pernah di-upload gambar
// custom, front-end otomatis tetap pakai gambar default dari HTML.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const STORE_FILE = path.join(DATA_DIR, 'qr-images-store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'qr-uploads');

const SLOTS = ['left', 'center', 'right'];

function ensureReady() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
        const empty = { left: null, center: null, right: null };
        fs.writeFileSync(STORE_FILE, JSON.stringify(empty, null, 2));
    }
}

function readStore() {
    ensureReady();
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('[qrImageStore] Gagal baca store, reset ke kosong:', err);
        return { left: null, center: null, right: null };
    }
}

function writeStore(store) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

// entry: { filename, mimeType, updatedAt }
function setSlotImage(slot, entry) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const store = readStore();

    // Hapus file lama punya slot ini (kalau ada) biar folder upload gak
    // numpuk file yang udah gak kepake tiap kali diganti.
    const prev = store[slot];
    if (prev && prev.filename) {
        const prevPath = path.join(UPLOAD_DIR, prev.filename);
        fs.unlink(prevPath, () => {}); // best-effort, gak perlu nunggu/gagal-fatal
    }

    store[slot] = entry;
    writeStore(store);
    return store[slot];
}

function getSlotImage(slot) {
    if (!isValidSlot(slot)) return null;
    const store = readStore();
    return store[slot] || null;
}

function getMeta() {
    const store = readStore();
    const meta = {};
    SLOTS.forEach((slot) => {
        const entry = store[slot];
        meta[slot] = entry
            ? { hasCustom: true, updatedAt: entry.updatedAt }
            : { hasCustom: false, updatedAt: null };
    });
    return meta;
}

module.exports = {
    SLOTS,
    UPLOAD_DIR,
    isValidSlot,
    setSlotImage,
    getSlotImage,
    getMeta
};