// routes/map.js
//
// Router Express untuk fitur peta lokasi investasi interaktif. Titik
// lokasi disimpan lewat data/mapStore.js. Endpoint:
//   GET    /api/map/list      -> daftar semua lokasi (publik, tidak perlu
//                                  kata sandi -- hanya untuk melihat peta)
//   POST   /api/map           -> tambah lokasi baru (WAJIB kata sandi)
//   PUT    /api/map/:id       -> ubah lokasi (WAJIB kata sandi)
//   DELETE /api/map/:id       -> hapus lokasi (WAJIB kata sandi)
//
// CARA PASANG ke server.js (2 baris, taruh dekat route qr-images/music):
//   const mapRouter = require('./routes/map');
//   app.use('/api/map', mapRouter);
//
// KATA SANDI: memakai variabel .env yang SAMA dengan fitur pengelolaan
// konten lain (QR_EDIT_PASSWORD), supaya hanya satu kata sandi yang perlu
// diingat untuk semua fitur kelola konten di situs ini.
//
// PENTING: endpoint di bawah membaca req.body sebagai JSON -- mengasumsikan
// express.json() sudah dipasang secara global di server.js (seperti yang
// sudah dipakai oleh /api/chat, /api/auth, dan endpoint DELETE di
// routes/music.js).
//
// CATATAN PATH: baris require di bawah mengasumsikan folder data/ berada
// di root proyek (sejajar dengan routes/, server.js). Kalau folder data/
// ada di dalam public/data/, ganti baris require menjadi:
//   require('../public/data/mapStore')

const express = require('express');
const crypto = require('crypto');

const store = require('../data/mapStore');

const router = express.Router();

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 600;

/* ------------------------------------------------------------------ */
/* Proteksi kata sandi + penjagaan dasar (pola identik dengan          */
/* routes/qrImages.js, routes/qrBg.js, routes/music.js)                */
/* ------------------------------------------------------------------ */

const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function checkLockout(req, res) {
    const ip = getClientIp(req);
    const rec = failedAttempts.get(ip);
    if (rec && rec.lockedUntil && Date.now() < rec.lockedUntil) {
        const waitSec = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
        res.status(429).json({
            success: false,
            message: `Terlalu banyak percobaan yang gagal. Silakan coba kembali dalam ${waitSec} detik.`
        });
        return false;
    }
    return true;
}

function registerFailedAttempt(req) {
    const ip = getClientIp(req);
    const rec = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCKOUT_MS;
        rec.count = 0;
    }
    failedAttempts.set(ip, rec);
}

function clearFailedAttempts(req) {
    failedAttempts.delete(getClientIp(req));
}

function verifyPassword(inputPassword) {
    const real = process.env.QR_EDIT_PASSWORD;
    if (!real) return { ok: false, reason: 'not-configured' };
    if (!inputPassword) return { ok: false, reason: 'wrong' };

    const a = Buffer.from(String(inputPassword));
    const b = Buffer.from(String(real));
    if (a.length !== b.length) return { ok: false, reason: 'wrong' };
    const match = crypto.timingSafeEqual(a, b);
    return { ok: match, reason: match ? null : 'wrong' };
}

function handlePasswordFailure(req, res, verdict) {
    registerFailedAttempt(req);
    if (verdict.reason === 'not-configured') {
        res.status(500).json({
            success: false,
            message: 'Fitur pengelolaan peta belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada berkas .env server terlebih dahulu.'
        });
        return;
    }
    res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
}

/* ------------------------------------------------------------------ */
/* Validasi input lokasi                                               */
/* ------------------------------------------------------------------ */

function validateCoords(lat, lng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
    if (latNum < -90 || latNum > 90) return null;
    if (lngNum < -180 || lngNum > 180) return null;
    return { lat: latNum, lng: lngNum };
}

/* ------------------------------------------------------------------ */
/* GET /api/map/list                                                   */
/* ------------------------------------------------------------------ */
router.get('/list', (req, res) => {
    res.json({ success: true, locations: store.getAll() });
});

/* ------------------------------------------------------------------ */
/* POST /api/map  (JSON body: { password, lat, lng, title, description }) */
/* ------------------------------------------------------------------ */
router.post('/', (req, res) => {
    if (!checkLockout(req, res)) return;

    const body = req.body || {};
    const verdict = verifyPassword(body.password);
    if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
    clearFailedAttempts(req);

    const coords = validateCoords(body.lat, body.lng);
    if (!coords) {
        return res.status(400).json({ success: false, message: 'Koordinat lokasi tidak valid.' });
    }

    const title = String(body.title || '').trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) {
        return res.status(400).json({ success: false, message: 'Judul lokasi wajib diisi.' });
    }
    const description = String(body.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);

    const entry = store.addLocation({ lat: coords.lat, lng: coords.lng, title, description });
    res.json({ success: true, message: 'Lokasi berhasil ditambahkan.', location: entry });
});

/* ------------------------------------------------------------------ */
/* PUT /api/map/:id  (JSON body: { password, lat?, lng?, title?, description? }) */
/* ------------------------------------------------------------------ */
router.put('/:id', (req, res) => {
    if (!checkLockout(req, res)) return;

    const body = req.body || {};
    const verdict = verifyPassword(body.password);
    if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
    clearFailedAttempts(req);

    const existing = store.getById(req.params.id);
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

    const updated = store.updateLocation(req.params.id, patch);
    res.json({ success: true, message: 'Lokasi berhasil diperbarui.', location: updated });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/map/:id  (JSON body: { password })                      */
/* ------------------------------------------------------------------ */
router.delete('/:id', (req, res) => {
    if (!checkLockout(req, res)) return;

    const body = req.body || {};
    const verdict = verifyPassword(body.password);
    if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
    clearFailedAttempts(req);

    const deleted = store.deleteLocation(req.params.id);
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Lokasi tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Lokasi berhasil dihapus.' });
});

module.exports = router;