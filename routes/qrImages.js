const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/qrImageStore');
const { redis, getJSON, setJSON } = require('../lib/redisClient');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Diturunin dari 5MB -> 4MB. Upload di sini masih lewat pola "server upload"
// (file singgah dulu di body request Express sebelum dikirim ke Vercel Blob),
// dan Vercel Functions punya limit ukuran body request sekitar 4.5MB. Kalau
// nanti butuh file lebih besar, ganti ke pola "client upload" langsung ke
// Blob (lihat docs @vercel/blob) yang gak lewat body server sama sekali.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80; // ubah di sini kalau perlu batas karakter judul berbeda

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

// ------------------------------------------------------------------
// Rate limit percobaan password gagal -- sekarang disimpan di Redis
// (bukan Map di memory) karena tiap invocation Vercel Function bisa jatuh
// di instance yang berbeda-beda; Map di memory bakal ke-reset kapan aja
// dan gak bakal konsisten ngunci IP yang sama.
// ------------------------------------------------------------------
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60; // 5 menit

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function lockoutKey(req) {
    return `qr-lockout:${getClientIp(req)}`;
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
    // TTL 2x lockout window biar key otomatis kebersihin sendiri di Redis.
    await setJSON(key, rec, { ex: LOCKOUT_SECONDS * 2 });
}

async function clearFailedAttempts(req) {
    await redis.del(lockoutKey(req));
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
        console.error('[qrImages] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Endpoint ini SENGAJA dipertahankan bentuknya (/file/:slot) biar frontend
// (QRCodeRevealAnimation.js) gak perlu diubah -- sekarang isinya redirect ke
// URL Vercel Blob yang sedang aktif untuk slot itu, bukan res.sendFile lokal.
router.get('/file/:slot', async (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    try {
        const entry = await store.getSlotImage(slot);
        if (!entry || !entry.url) {
            return res.status(404).json({ success: false, message: 'Belum terdapat gambar khusus untuk slot ini.' });
        }
        res.redirect(302, entry.url);
    } catch (err) {
        console.error('[qrImages] Gagal ambil file:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil berkas dari server.' });
    }
});

router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('image')(req, res, async (uploadErr) => {
        // KUNCI PERBAIKANNYA ADA DI SINI: seluruh isi callback ini dibungkus
        // try/catch. Apa pun yang meleset di dalamnya (Blob gagal diakses,
        // Redis gagal diakses, dll) sekarang PASTI ketangkep dan tetap kirim
        // response JSON -- bukan bikin function mati diam-diam kayak
        // sebelumnya (itu penyebab persis net::ERR_EMPTY_RESPONSE).
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await checkLockout(req, res))) return;

            const { password, title } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur pembaruan gambar belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

            const trimmedTitle = typeof title === 'string' ? title.trim() : '';

            if (trimmedTitle.length > MAX_TITLE_LENGTH) {
                return res.status(400).json({
                    success: false,
                    message: `Judul terlalu panjang (maksimal ${MAX_TITLE_LENGTH} karakter).`
                });
            }

            if (!req.file && !trimmedTitle) {
                return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar atau judul baru yang dikirim.' });
            }

            let entry;
            if (req.file) {
                const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
                entry = await store.setSlotImage(slot, {
                    buffer: req.file.buffer,
                    mimeType: req.file.mimetype,
                    ext,
                    title: trimmedTitle || undefined
                });
            } else {
                entry = await store.setSlotTitle(slot, trimmedTitle);
            }

            res.json({
                success: true,
                message: 'Perubahan berhasil disimpan.',
                entry
            });
        } catch (fatalErr) {
            console.error('[qrImages] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;