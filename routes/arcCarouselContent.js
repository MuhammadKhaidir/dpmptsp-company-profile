// routes/arcCarouselContent.js
//
// Router Express untuk fitur Tambah/Hapus Buku di ArcCarousel. Endpoint
// dipertahankan sama persis (GET /api/arc-carousel/content,
// POST /api/arc-carousel/book/add, POST /api/arc-carousel/book/delete)
// -- frontend (public/js/Arccarousel.js) gak perlu diubah sama sekali.
//
// FIX: sebelumnya route ini manggil store.addBook({ title, file }) padahal
// data/arcCarouselStore.js definisinya addBook(title, pdf) -- dua argumen
// terpisah, bukan satu object. Akibatnya title yang kesimpen jadi seluruh
// object (bukan string judul doang) dan PDF gak pernah keupload karena
// parameter pdf selalu undefined. Sekarang manggilnya udah disesuaikan
// biar match sama store.

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/arcCarouselStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

// Sama kayak route lain: Vercel Functions punya limit ukuran body
// request sekitar 4.5MB, jadi diturunin ke 4MB.
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
    // Boleh pake ARC_CAROUSEL_EDIT_PASSWORD sendiri kalau diset di env,
    // kalau enggak fallback ke QR_EDIT_PASSWORD (password global semua
    // fitur edit) -- sama kayak fallback di routes/flipbookContent.js.
    const real = process.env.ARC_CAROUSEL_EDIT_PASSWORD || process.env.QR_EDIT_PASSWORD;
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
                message: 'Fitur kelola buku belum dikonfigurasi. Silakan atur ARC_CAROUSEL_EDIT_PASSWORD atau QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
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

            const pdf = req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : null;

            // FIX: store.addBook nerima (title, pdf) -- dua argumen terpisah,
            // BUKAN satu object { title, file }.
            const book = await store.addBook(title, pdf);

            res.json({ success: true, message: 'Buku berhasil ditambahkan.', book });
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
        res.json({ success: true, message: 'Buku berhasil dihapus.', book: removed });
    } catch (fatalErr) {
        console.error('[arcCarouselContent] Error tak terduga saat hapus buku:', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menghapus buku.' });
        }
    }
});

module.exports = router;