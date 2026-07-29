// data/musicStore.js
//
// Penyimpanan sederhana (file JSON, BUKAN MySQL) untuk fitur musik latar.
// Menyimpan hingga 3 slot lagu (slot1, slot2, slot3), masing-masing berisi
// judul + berkas audio. Mengikuti pola yang sama persis dengan
// data/qrImageStore.js -- taruh file ini di data/ level root proyek
// (sejajar dengan routes/, server.js, dll), BUKAN di dalam public/.

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
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

// entry: { filename, mimeType, title, updatedAt }
function setSlotTrack(slot, entry) {
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

// Daftar publik -- hanya slot yang terisi yang ditampilkan, dan hanya
// informasi yang aman ditampilkan ke pengguna umum (judul, waktu update).
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