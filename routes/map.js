// routes/map.js
//
// Endpoint & URL dipertahankan sama persis.
//
// BARU: password per-aksi (QR_EDIT_PASSWORD) DICABUT, digantikan sesi
// login admin (lihat middleware/requireAdmin.js), konsisten sama route
// edit lainnya.

const express = require('express');

const store = require('../data/mapStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 600;

function validateCoords(lat, lng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
    if (latNum < -90 || latNum > 90) return null;
    if (lngNum < -180 || lngNum > 180) return null;
    return { lat: latNum, lng: lngNum };
}

router.get('/list', async (req, res) => {
    try {
        const locations = await store.getAll();
        res.json({ success: true, locations });
    } catch (err) {
        console.error('[map] Gagal ambil list:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

router.post('/', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};

        const coords = validateCoords(body.lat, body.lng);
        if (!coords) {
            return res.status(400).json({ success: false, message: 'Koordinat lokasi tidak valid.' });
        }

        const title = String(body.title || '').trim().slice(0, MAX_TITLE_LENGTH);
        if (!title) {
            return res.status(400).json({ success: false, message: 'Judul lokasi wajib diisi.' });
        }
        const description = String(body.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);

        const entry = await store.addLocation({ lat: coords.lat, lng: coords.lng, title, description });
        res.json({ success: true, message: 'Lokasi berhasil ditambahkan.', location: entry });
    } catch (fatalErr) {
        console.error('[map] Error tak terduga saat tambah:', fatalErr);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
        }
    }
});

router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};

        const existing = await store.getById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Lokasi tidak ditemukan.' });
        }

        const patch = {};

        if (body.lat !== undefined || body.lng !== undefined) {
            const coords = validateCoords(
                body.lat !== undefined ? body.lat : existing.lat,
                body.lng !== undefined ? body.lng : existing.lng
            );
            if (!coords) {
                return res.status(400).json({ success: false, message: 'Koordinat lokasi tidak valid.' });
            }
            patch.lat = coords.lat;
            patch.lng = coords.lng;
        }

        if (body.title !== undefined) {
            const title = String(body.title || '').trim().slice(0, MAX_TITLE_LENGTH);
            if (!title) {
                return res.status(400).json({ success: false, message: 'Judul lokasi wajib diisi.' });
            }
            patch.title = title;
        }

        if (body.description !== undefined) {
            patch.description = String(body.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
        }

        const updated = await store.updateLocation(req.params.id, patch);
        res.json({ success: true, message: 'Lokasi berhasil diperbarui.', location: updated });
    } catch (fatalErr) {
        console.error('[map] Error tak terduga saat ubah:', fatalErr);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
        }
    }
});

router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const deleted = await store.deleteLocation(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Lokasi tidak ditemukan.' });
        }
        res.json({ success: true, message: 'Lokasi berhasil dihapus.' });
    } catch (fatalErr) {
        console.error('[map] Error tak terduga saat hapus:', fatalErr);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
        }
    }
});

module.exports = router;