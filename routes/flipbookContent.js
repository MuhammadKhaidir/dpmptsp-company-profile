// routes/arcCarouselContent.js
//
// Router Express untuk fitur Tambah/Hapus Buku di ArcCarousel. Endpoint
// dipertahankan sama persis kayak sebelumnya (GET /api/arc-carousel/content,
// POST /api/arc-carousel/book/add, POST /api/arc-carousel/book/delete)
// -- biar frontend (public/js/Arccarousel.js) gak perlu diubah sama sekali.
//
// Pola sama persis kayak routes/flipbookContent.js & routes/qrBg.js:
// password + rate limit lockout lewat Redis (helper guardPassword),
// upload PDF lewat Vercel Blob, metadata lewat Upstash Redis (via
// data/arcCarouselStore.js).

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/arcCarouselStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

// Sama kayak routes/qrBg.js & routes/flipbookContent.js: Vercel Functions
// punya limit ukuran body request sekitar 4.5MB, jadi diturunin ke 4MB.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            cb(new Error('Berkas harus berformat PDF.'));
            return;
        }
        cb(null, true);
    }
});

/* ------------------------------------------------------------------ */
/* Rate limit -- pola SAMA PERSIS dengan routes/qrBg.js & flipbookContent.js */
/* ------------------------------------------------------------------ */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function lockoutKey(req) {
    return `arc-carousel-lockout:${getClientIp(req)}`;
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
    // Password global -- sama persis kayak fitur QR bg, biar satu kata
    // sandi berlaku buat semua fitur edit di website ini.
    const real = process.env.QR_EDIT_PASSWORD;
    if (!real) return { ok: false, reason: 'not-configured' };
    if (!inputPassword) return { ok: false, reason: 'wrong' };

    const a = Buffer.from(String(inputPassword));
    const b = Buffer.from(String(real));
    if (a.length !== b.length) return { ok: false, reason: 'wrong' };
    const match = crypto.timingSafeEqual(a, b);
    return { ok: match, reason: match ? null : 'wrong' };
}

// Helper: cek lockout + password, return true kalau boleh lanjut.
// Kalau gagal, res sudah dikirim di dalam sini -- caller tinggal `return`.
async function guardPassword(req, res) {
    if (!(await checkLockout(req, res))) return false;

    const verdict = verifyPassword(req.body.password);
    if (!verdict.ok) {
        await registerFailedAttempt(req);
        if (verdict.reason === 'not-configured') {
            res.status(500).json({
                success: false,
                message: 'Fitur ini belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
            });
            return false;
        }
        res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
        return false;
    }

    await clearFailedAttempts(req);
    return true;
}

// GET /api/arc-carousel/content -- publik, gak perlu password.
router.get('/content', async (req, res) => {
    try {
        const books = await store.getBooks();
        res.json({ success: true, books });
    } catch (err) {
        console.error('[arcCarouselContent] Gagal ambil daftar buku:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar buku dari server.' });
    }
});

// POST /api/arc-carousel/book/add  (multipart/form-data: title, password, pdf?)
router.post('/book/add', (req, res) => {
    upload.single('pdf')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await guardPassword(req, res))) return;

            const title = (req.body.title || '').trim();
            if (!title) {
                return res.status(400).json({ success: false, message: 'Judul buku wajib diisi.' });
            }

            const file = req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : null;
            const book = await store.addBook({ title, file });

            res.json({ success: true, book });
        } catch (fatalErr) {
            console.error('[arcCarouselContent] Error tak terduga saat tambah buku:', fatalErr);
            if (!res.headersSent) {
                res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menyimpan buku.' });
            }
        }
    });
});

// POST /api/arc-carousel/book/delete  (multipart/form-data: id, password)
router.post('/book/delete', upload.none(), async (req, res) => {
    try {
        if (!(await guardPassword(req, res))) return;

        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'ID buku tidak ditemukan.' });
        }

        const removed = await store.deleteBook(id);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'Buku tidak ditemukan.' });
        }

        res.json({ success: true, id });
    } catch (fatalErr) {
        console.error('[arcCarouselContent] Error tak terduga saat hapus buku:', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menghapus buku.' });
        }
    }
});

module.exports = router;