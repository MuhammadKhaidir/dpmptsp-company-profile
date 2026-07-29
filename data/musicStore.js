// data/musicStore.js
//
// Penyimpanan sederhana (file JSON, BUKAN MySQL) untuk fitur musik latar.
// Menyimpan hingga 3 slot lagu (slot1, slot2, slot3), masing-masing berisi
// judul + berkas audio.

const fs = require('fs');
const path = require('path');

// Lihat komentar di data/qrImageStore.js -- pola yang sama persis.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STORE_FILE = path.join(DATA_DIR, 'music-store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'music-uploads');

const SLOTS = ['slot1', 'slot2', 'slot3'];

function ensureReady() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
        const empty = { slot1: null, slot2: null, slot3: null };
        fs.writeFileSync(STORE_FILE, JSON.stringify(empty, null, 2));
    }
}

function readStore() {
    ensureReady();
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('[musicStore] Gagal membaca store, reset ke kosong:', err);
        return { slot1: null, slot2: null, slot3: null };
    }
}

function writeStore(store) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function isValidSlot(slot) {
    return SLOTS.includes(slot);
}

function setSlotTrack(slot, entry) {
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

function clearSlotTrack(slot) {
    if (!isValidSlot(slot)) throw new Error('Slot tidak valid: ' + slot);
    const store = readStore();
    const prev = store[slot];
    if (prev && prev.filename) {
        fs.unlink(path.join(UPLOAD_DIR, prev.filename), () => {});
    }
    store[slot] = null;
    writeStore(store);
}

function getSlotTrack(slot) {
    if (!isValidSlot(slot)) return null;
    return readStore()[slot] || null;
}

function getPublicList() {
    const store = readStore();
    return SLOTS
        .map((slot) => {
            const entry = store[slot];
            if (!entry) return null;
            return { slot, title: entry.title || 'Tanpa Judul', updatedAt: entry.updatedAt };
        })
        .filter(Boolean);
}

module.exports = {
    SLOTS,
    UPLOAD_DIR,
    isValidSlot,
    setSlotTrack,
    clearSlotTrack,
    getSlotTrack,
    getPublicList
};