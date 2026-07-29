// routes/qrBg.js
//
// Router Express untuk fitur "ganti gambar LATAR BELAKANG di belakang
// kotak QR" (elemen .qr-hover-bg-left/center/right yang muncul redup saat
// kotak QR di-hover). TERPISAH dari routes/qrImages.js (yang mengurus
// gambar kode QR itu sendiri) -- keduanya independen.
//
// Endpoint:
//   GET  /api/qr-bg/meta        -> info slot mana yang memiliki gambar
//                                   latar khusus + kapan terakhir diperbarui
//   GET  /api/qr-bg/file/:slot  -> mengalirkan BYTES gambar latar slot itu
//   POST /api/qr-bg/:slot       -> mengunggah/mengganti gambar latar
//                                   (WAJIB kata sandi)
//
// CARA PASANG ke server.js (2 baris, taruh dekat route qr-images):
//   const qrBgRouter = require('./routes/qrBg');
//   app.use('/api/qr-bg', qrBgRouter);
//
// WAJIB: multer (sudah terpasang dari fitur ganti gambar QR sebelumnya,
// tidak perlu instal ulang).
//
// KATA SANDI: memakai variabel .env yang SAMA dengan fitur pengelolaan
// konten lain (QR_EDIT_PASSWORD), supaya hanya satu kata sandi yang perlu
// diingat untuk semua fitur kelola konten.
//
// CATATAN PATH: baris require di bawah mengasumsikan folder data/ berada
// di root proyek (sejajar dengan routes/, server.js), sama seperti
// routes/qrImages.js. Kalau folder data/ ada di dalam public/data/, ganti
// baris require menjadi: require('../public/data/qrBgStore')

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const store = require('../data/qrBgStore');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
/* Proteksi kata sandi + penjagaan dasar (pola identik dengan          */
/* routes/qrImages.js)                                                 */
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

/* ------------------------------------------------------------------ */
/* GET /api/qr-bg/meta                                                 */
/* ------------------------------------------------------------------ */
router.get('/meta', (req, res) => {
    res.json({ success: true, meta: store.getMeta() });
});

/* ------------------------------------------------------------------ */
/* GET /api/qr-bg/file/:slot                                           */
/* ------------------------------------------------------------------ */
router.get('/file/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    const entry = store.getSlotImage(slot);
    if (!entry) {
        return res.status(404).json({ success: false, message: 'Belum terdapat gambar latar khusus untuk slot ini.' });
    }
    const filePath = path.join(store.UPLOAD_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Berkas gambar tidak ditemukan pada server.' });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
    res.sendFile(filePath);
});

/* ------------------------------------------------------------------ */
/* POST /api/qr-bg/:slot  (multipart: password, image)                 */
/* ------------------------------------------------------------------ */
router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    if (!checkLockout(req, res)) return;

    upload.single('image')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Proses pengunggahan gagal.' });
        }

        const { password } = req.body;
        const verdict = verifyPassword(password);

        if (!verdict.ok) {
            registerFailedAttempt(req);
            if (verdict.reason === 'not-configured') {
                return res.status(500).json({
                    success: false,
                    message: 'Fitur pengelolaan gambar latar belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada berkas .env server terlebih dahulu.'
                });
            }
            return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
        }

        clearFailedAttempts(req);

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar yang dikirim.' });
        }

        const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
        const filename = `${slot}-bg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const destPath = path.join(store.UPLOAD_DIR, filename);

        fs.writeFile(destPath, req.file.buffer, (writeErr) => {
            if (writeErr) {
                console.error('[qrBg] Gagal menyimpan berkas:', writeErr);
                return res.status(500).json({ success: false, message: 'Gagal menyimpan berkas pada server.' });
            }

            const entry = store.setSlotImage(slot, {
                filename,
                mimeType: req.file.mimetype,
                updatedAt: Date.now()
            });

            res.json({ success: true, message: 'Gambar latar berhasil diperbarui.', entry });
        });
    });
});

module.exports = router;