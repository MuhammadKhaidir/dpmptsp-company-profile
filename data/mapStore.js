// data/mapStore.js
//
// Penyimpanan sederhana (file JSON, BUKAN MySQL) untuk titik-titik lokasi
// investasi yang ditampilkan di peta interaktif.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lihat komentar di data/qrImageStore.js -- pola yang sama persis.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STORE_FILE = path.join(DATA_DIR, 'map-locations.json');

function ensureReady() {
    if (!fs.existsSync(STORE_FILE)) {
        fs.writeFileSync(STORE_FILE, JSON.stringify([], null, 2));
    }
}

function readStore() {
    ensureReady();
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('[mapStore] Gagal membaca store, reset ke kosong:', err);
        return [];
    }
}

function writeStore(list) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(list, null, 2));
}

function getAll() {
    return readStore();
}

function getById(id) {
    return readStore().find((loc) => loc.id === id) || null;
}

function addLocation(data) {
    const list = readStore();
    const entry = {
        id: Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex'),
        lat: data.lat,
        lng: data.lng,
        title: data.title,
        description: data.description || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    list.push(entry);
    writeStore(list);
    return entry;
}

function updateLocation(id, patch) {
    const list = readStore();
    const idx = list.findIndex((loc) => loc.id === id);
    if (idx === -1) return null;

    const current = list[idx];
    const updated = {
        ...current,
        lat: patch.lat !== undefined ? patch.lat : current.lat,
        lng: patch.lng !== undefined ? patch.lng : current.lng,
        title: patch.title !== undefined ? patch.title : current.title,
        description: patch.description !== undefined ? patch.description : current.description,
        updatedAt: Date.now()
    };
    list[idx] = updated;
    writeStore(list);
    return updated;
}

function deleteLocation(id) {
    const list = readStore();
    const next = list.filter((loc) => loc.id !== id);
    const changed = next.length !== list.length;
    if (changed) writeStore(next);
    return changed;
}

module.exports = {
    getAll,
    getById,
    addLocation,
    updateLocation,
    deleteLocation
};