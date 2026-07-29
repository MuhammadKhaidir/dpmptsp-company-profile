// routes/map.js
//
// Endpoint & URL dipertahankan sama persis. Rate-limit sekarang lewat
// Redis (bukan Map di memory), pola sama dengan routes/qrImages.js.

const express = require('express');
const crypto = require('crypto');

const store = require('../data/mapStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 600;

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function lockoutKey(req) {
    return `map-lockout:${getClientIp(req)}`;
}

async function checkLockout(req, res) {
    const rec = await getJSON(lockoutKey(req));
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

async function registerFailedAttempt(req) {
    const key = lockoutKey(req);
    const rec = (await getJSON(key)) || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
        rec.count = 0;
    }
    await setJSON(key, rec, { ex: LOCKOUT_SECONDS * 2 });
}

async function clearFailedAttempts(req) {
    await delKey(lockoutKey(req));
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

async function handlePasswordFailure(req, res, verdict) {
    await registerFailedAttempt(req);
    if (verdict.reason === 'not-configured') {
        res.status(500).json({
            success: false,
            message: 'Fitur pengelolaan peta belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
        });
        return;
    }
    res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
}

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

router.post('/', async (req, res) => {
    try {
        if (!(await checkLockout(req, res))) return;

        const body = req.body || {};
        const verdict = verifyPassword(body.password);
        if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
        await clearFailedAttempts(req);

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

router.put('/:id', async (req, res) => {
    try {
        if (!(await checkLockout(req, res))) return;

        const body = req.body || {};
        const verdict = verifyPassword(body.password);
        if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
        await clearFailedAttempts(req);

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

router.delete('/:id', async (req, res) => {
    try {
        if (!(await checkLockout(req, res))) return;

        const body = req.body || {};
        const verdict = verifyPassword(body.password);
        if (!verdict.ok) return handlePasswordFailure(req, res, verdict);
        await clearFailedAttempts(req);

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