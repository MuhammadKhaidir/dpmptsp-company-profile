// data/qrBgStore.js
//
// Penyimpanan sederhana (file JSON, BUKAN MySQL) untuk gambar LATAR
// BELAKANG yang muncul di belakang kotak QR saat kotak tersebut di-hover
// (elemen .qr-hover-bg-left/center/right). Ini TERPISAH dari gambar kode
// QR itu sendiri (yang disimpan lewat data/qrImageStore.js).

const fs = require('fs');
const path = require('path');

// Lihat komentar di data/qrImageStore.js -- pola yang sama persis.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STORE_FILE = path.join(DATA_DIR, 'qr-bg-store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'qr-bg-uploads');

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
        console.error('[qrBgStore] Gagal membaca store, reset ke kosong:', err);
        return { left: null, center: null, right: null };
    }
}

function writeStore(store) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function setSlotImage(slot, entry) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const store = readStore();

    const prev = store[slot];
    if (prev && prev.filename) {
        fs.unlink(path.join(UPLOAD_DIR, prev.filename), () => {});
    }

    store[slot] = entry;
    writeStore(store);
    return store[slot];
}

function getSlotImage(slot) {
    if (!isValidSlot(slot)) return null;
    return readStore()[slot] || null;
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