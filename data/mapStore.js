// data/mapStore.js
//
// Penyimpanan titik-titik lokasi investasi untuk lingkungan SERVERLESS.
// Beda dari QR/musik: gak ada berkas yang diupload, cuma data teks/angka
// (judul, deskripsi, lat, lng) -- jadi CUKUP Upstash Redis, gak perlu
// Vercel Blob. Seluruh daftar disimpan sebagai satu array JSON di bawah
// satu key Redis.

const crypto = require('crypto');
const { getJSON, setJSON } = require('../lib/redisClient');

const LIST_KEY = 'map:locations';

async function getAll() {
    const list = await getJSON(LIST_KEY);
    return Array.isArray(list) ? list : [];
}

async function getById(id) {
    const list = await getAll();
    return list.find((loc) => loc.id === id) || null;
}

async function addLocation(data) {
    const list = await getAll();
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
    await setJSON(LIST_KEY, list);
    return entry;
}

async function updateLocation(id, patch) {
    const list = await getAll();
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
    await setJSON(LIST_KEY, list);
    return updated;
}

async function deleteLocation(id) {
    const list = await getAll();
    const next = list.filter((loc) => loc.id !== id);
    const changed = next.length !== list.length;
    if (changed) await setJSON(LIST_KEY, next);
    return changed;
}

module.exports = {
    getAll,
    getById,
    addLocation,
    updateLocation,
    deleteLocation
};