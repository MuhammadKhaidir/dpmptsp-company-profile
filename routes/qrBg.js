// routes/qrBg.js
//
// Router Express untuk fitur "ganti gambar LATAR BELAKANG di belakang
// kotak QR". Endpoint & URL SENGAJA dipertahankan bentuknya sama persis
// kayak sebelumnya (/api/qr-bg/meta, /api/qr-bg/file/:slot,
// POST /api/qr-bg/:slot) -- biar frontend (QRCodeRevealAnimation.js) gak
// perlu diubah sama sekali.

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/qrBgStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Diturunin dari 5MB -> 4MB, sama alasannya kayak di routes/qrImages.js:
// Vercel Functions punya limit ukuran body request sekitar 4.5MB.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(new Error('Format berkas tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.'));
            return;
        }
        cb(null, true);
    }
});

/* ------------------------------------------------------------------ */
/* Rate limit -- sekarang lewat Redis (bukan Map di memory), pola sama  */
/* persis dengan routes/qrImages.js                                    */
/* ------------------------------------------------------------------ */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function lockoutKey(req) {
    return `qr-bg-lockout:${getClientIp(req)}`;
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

router.get('/meta', async (req, res) => {
    try {
        const meta = await store.getMeta();
        res.json({ success: true, meta });
    } catch (err) {
        console.error('[qrBg] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Redirect ke URL Blob yang sedang aktif -- CSS background-image & <img>
// otomatis ikutin redirect ini, gak ada yang perlu diubah di frontend.
router.get('/file/:slot', async (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    try {
        const entry = await store.getSlotImage(slot);
        if (!entry || !entry.url) {
            return res.status(404).json({ success: false, message: 'Belum terdapat gambar latar khusus untuk slot ini.' });
        }
        res.redirect(302, entry.url);
    } catch (err) {
        console.error('[qrBg] Gagal ambil file:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil berkas dari server.' });
    }
});

router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('image')(req, res, async (uploadErr) => {
        // Seluruh isi callback dibungkus try/catch -- apa pun yang meleset
        // (Blob/Redis gagal diakses, dll) SELALU kirim response JSON,
        // bukan bikin function mati diam-diam (itu penyebab ERR_EMPTY_RESPONSE
        // yang kejadian kemarin).
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await checkLockout(req, res))) return;

            const { password } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur pengelolaan gambar latar belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar yang dikirim.' });
            }

            const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const entry = await store.setSlotImage(slot, {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                ext
            });

            res.json({ success: true, message: 'Gambar latar berhasil diperbarui.', entry });
        } catch (fatalErr) {
            console.error('[qrBg] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;