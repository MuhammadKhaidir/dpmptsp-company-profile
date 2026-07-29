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

// BARU: DATA_DIR sekarang bisa di-override lewat environment variable
// DATA_DIR (di-set ke "/data" lewat fly.toml pas deploy ke Fly.io, biar
// nulis ke VOLUME PERSISTEN, bukan ke folder di dalam image yang hilang
// tiap kali di-deploy ulang/restart). Kalau env var itu gak di-set (misal
// pas dijalanin lokal di laptop lewat "node server.js" / start.bat),
// otomatis balik ke __dirname kayak semula -- jadi perilaku development
// lokal SAMA SEKALI GAK BERUBAH.
const DATA_DIR = process.env.DATA_DIR || __dirname;
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

// entry: { filename, mimeType, title, updatedAt }
function setSlotImage(slot, entry) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const store = readStore();

    const prev = store[slot];
    if (prev && prev.filename && entry.filename && prev.filename !== entry.filename) {
        const prevPath = path.join(UPLOAD_DIR, prev.filename);
        fs.unlink(prevPath, () => {});
    }

    const merged = Object.assign({}, prev, entry);
    store[slot] = merged;
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
            ? { hasCustom: !!entry.filename, updatedAt: entry.updatedAt, title: entry.title }
            : { hasCustom: false, updatedAt: null, title: null };
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