// routes/arcCarouselContent.js
//
// Router Express untuk fitur Tambah/Hapus Buku di ArcCarousel. Endpoint
// dipertahankan sama persis kayak sebelumnya (GET /api/arc-carousel/content,
// POST /api/arc-carousel/book/add, POST /api/arc-carousel/book/delete)
// -- biar frontend (public/js/Arccarousel.js) gak perlu diubah sama sekali.
//
// Pola sama persis kayak routes/qrBg.js: upload -> Vercel Blob (lewat
// data/arcCarouselStore.js), rate-limit & password lewat Redis dengan
// crypto.timingSafeEqual, dan SELURUH proses dibungkus try/catch biar
// selalu balikin JSON -- gak pernah diam-diam mati (ERR_EMPTY_RESPONSE).

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/arcCarouselStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

// Vercel Functions punya limit ukuran body request sekitar 4.5MB, jadi
// diturunin ke 4MB (sama alasannya kayak routes/qrImages.js & qrBg.js).
// CATATAN: PDF buku biasanya lebih besar dari ini. Kalau kepentok limit
// ini, solusinya upload langsung dari browser ke Vercel Blob (client
// upload token) -- bilang aja kalau mau dibantu implementasiin itu.
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
/* Rate limit lewat Redis -- pola sama persis dengan routes/qrBg.js     */
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
    const real = process.env.ARC_CAROUSEL_PASSWORD;
    if (!real) return { ok: false, reason: 'not-configured' };
    if (!inputPassword) return { ok: false, reason: 'wrong' };

    const a = Buffer.from(String(inputPassword));
    const b = Buffer.from(String(real));
    if (a.length !== b.length) return { ok: false, reason: 'wrong' };
    const match = crypto.timingSafeEqual(a, b);
    return { ok: match, reason: match ? null : 'wrong' };
}

// GET /api/arc-carousel/content
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

            if (!(await checkLockout(req, res))) return;

            const { title, password } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur ini belum dikonfigurasi. Silakan atur ARC_CAROUSEL_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

            if (!title || !title.trim()) {
                return res.status(400).json({ success: false, message: 'Judul buku wajib diisi.' });
            }

            const file = req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : null;
            const book = await store.addBook({ title: title.trim(), file });

            res.json({ success: true, book });
        } catch (fatalErr) {
            console.error('[arcCarouselContent] Error tak terduga saat tambah buku:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan buku.' });
            }
        }
    });
});

// POST /api/arc-carousel/book/delete  (multipart/form-data: id, password)
router.post('/book/delete', (req, res) => {
    upload.none()(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Permintaan tidak valid.' });
            }

            if (!(await checkLockout(req, res))) return;

            const { id, password } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur ini belum dikonfigurasi. Silakan atur ARC_CAROUSEL_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

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
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menghapus buku.' });
            }
        }
    });
});

module.exports = router;