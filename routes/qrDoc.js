const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/qrDocStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

const ALLOWED_MIME = new Set(['application/pdf']);
const MAX_FILE_SIZE = 4 * 1024 * 1024; // Samain sama batas gambar QR (4MB) biar konsisten sama batas 4.5MB Vercel.
const MAX_URL_LENGTH = 2000;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(new Error('Format berkas tidak didukung. Hanya PDF yang diterima.'));
            return;
        }
        cb(null, true);
    }
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60; // 5 menit -- key lockout SAMA persis dengan routes/qrImages.js
                                  // ("qr-lockout:<ip>") karena satu password dipakai bareng di
                                  // semua fitur, jadi percobaan gagalnya juga ke-hitung bareng.

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

function isValidHttpUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

router.get('/meta', async (req, res) => {
    try {
        const meta = await store.getMeta();
        res.json({ success: true, meta });
    } catch (err) {
        console.error('[qrDoc] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('document')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await checkLockout(req, res))) return;

            const { password, mode, url } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur pembaruan dokumen belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

            // mode 'clear' -> hapus dokumen terkait, balik ke fallback flip book.
            if (mode === 'clear') {
                await store.clearSlotDoc(slot);
                return res.json({ success: true, message: 'Dokumen terkait berhasil dihapus.', entry: null });
            }

            if (mode === 'pdf') {
                if (!req.file) {
                    return res.status(400).json({ success: false, message: 'Tidak ada berkas PDF yang dikirim.' });
                }
                const entry = await store.setSlotDocFile(slot, {
                    buffer: req.file.buffer,
                    mimeType: req.file.mimetype,
                    ext: 'pdf'
                });
                return res.json({ success: true, message: 'Perubahan berhasil disimpan.', entry });
            }

            if (mode === 'link') {
                const trimmedUrl = typeof url === 'string' ? url.trim() : '';
                if (!trimmedUrl) {
                    return res.status(400).json({ success: false, message: 'Tautan tidak boleh kosong.' });
                }
                if (trimmedUrl.length > MAX_URL_LENGTH) {
                    return res.status(400).json({ success: false, message: 'Tautan terlalu panjang.' });
                }
                if (!isValidHttpUrl(trimmedUrl)) {
                    return res.status(400).json({ success: false, message: 'Tautan tidak valid. Gunakan format lengkap, contoh: https://contoh.go.id/dokumen' });
                }
                const entry = await store.setSlotDocLink(slot, trimmedUrl);
                return res.json({ success: true, message: 'Perubahan berhasil disimpan.', entry });
            }

            return res.status(400).json({ success: false, message: 'Mode tidak dikenali.' });
        } catch (fatalErr) {
            console.error('[qrDoc] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;