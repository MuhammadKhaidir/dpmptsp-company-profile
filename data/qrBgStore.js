// data/qrBgStore.js
//
// Penyimpanan sederhana (file JSON, BUKAN MySQL) untuk gambar LATAR
// BELAKANG yang muncul di belakang kotak QR saat kotak tersebut di-hover
// (elemen .qr-hover-bg-left/center/right). Ini TERPISAH dari gambar kode
// QR itu sendiri (yang disimpan lewat data/qrImageStore.js) -- keduanya
// sengaja dibuat independen supaya masing-masing bisa diganti tanpa
// saling mempengaruhi atau berisiko merusak fitur yang sudah berjalan.
//
// Mengikuti pola yang sama persis dengan data/qrImageStore.js. Taruh file
// ini di data/ level root proyek (sejajar dengan routes/, server.js, dll),
// BUKAN di dalam public/.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
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

// entry: { filename, mimeType, updatedAt }
function setSlotImage(slot, entry) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const store = readStore();

    // Hapus berkas lama milik slot ini (kalau ada) supaya folder upload
    // tidak menumpuk berkas yang sudah tidak terpakai setiap kali diganti.
    const prev = store[slot];
    if (prev && prev.filename) {
        fs.unlink(path.join(UPLOAD_DIR, prev.filename), () => {}); // best-effort
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