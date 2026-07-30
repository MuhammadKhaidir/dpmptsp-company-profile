// routes/flipbookContent.js
//
// Router Express untuk fitur EDIT KONTEN FlipBook per halaman (ganti
// tulisan, ganti/tambah gambar per halaman) dan TAMBAH HALAMAN BARU.
// Mengikuti pola yang SAMA PERSIS dengan routes/qrBg.js: password lewat
// env var + rate limit lockout lewat Redis, upload gambar lewat
// Vercel Blob, data teks lewat Upstash Redis (via data/flipbookStore.js).

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/flipbookStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Sama kayak routes/qrBg.js: Vercel Functions punya limit ukuran body
// request sekitar 4.5MB, jadi diturunin ke 4MB.
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
/* Rate limit -- pola SAMA PERSIS dengan routes/qrBg.js                */
/* ------------------------------------------------------------------ */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function lockoutKey(req) {
    return `flipbook-lockout:${getClientIp(req)}`;
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
    // Boleh reuse QR_EDIT_PASSWORD kalau FLIPBOOK_EDIT_PASSWORD belum
    // diatur -- biar gak wajib bikin password baru kalau mau pakai yang
    // sama dengan fitur QR bg.
    const real = process.env.FLIPBOOK_EDIT_PASSWORD || process.env.QR_EDIT_PASSWORD;
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
                message: 'Fitur edit flipbook belum dikonfigurasi. Silakan atur FLIPBOOK_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
            });
            return false;
        }
        res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
        return false;
    }

    await clearFailedAttempts(req);
    return true;
}

// Publik -- siapa aja boleh baca konten buku, gak perlu password.
router.get('/content', async (req, res) => {
    try {
        const books = await store.getBooks();
        res.json({ success: true, books });
    } catch (err) {
        console.error('[flipbookContent] Gagal ambil konten:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Edit satu halaman: tulisan + (opsional) gambar baru.
// Body (multipart/form-data): bookIndex, leafType ('cover'|'content'|'back'),
// contentIndex (wajib kalau leafType='content'), password,
// lalu field teks sesuai jenis halaman (kicker/heading/body/tagline/page),
// dan file opsional di field 'image'.
router.post('/page', (req, res) => {
    upload.single('image')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await guardPassword(req, res))) return;

            const bookIndex = parseInt(req.body.bookIndex, 10);
            const leafType = req.body.leafType;
            const contentIndex = req.body.contentIndex !== undefined ? parseInt(req.body.contentIndex, 10) : undefined;

            if (Number.isNaN(bookIndex) || !['cover', 'content', 'back'].includes(leafType)) {
                return res.status(400).json({ success: false, message: 'Data halaman yang dikirim tidak lengkap.' });
            }
            if (leafType === 'content' && Number.isNaN(contentIndex)) {
                return res.status(400).json({ success: false, message: 'Nomor halaman yang dituju tidak dikenali.' });
            }

            const fields = {};
            ['kicker', 'heading', 'body', 'tagline', 'page'].forEach((key) => {
                if (req.body[key] !== undefined) fields[key] = req.body[key];
            });

            let image = null;
            if (req.file) {
                const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
                image = { buffer: req.file.buffer, mimeType: req.file.mimetype, ext };
            }

            const book = await store.updatePage(bookIndex, leafType, contentIndex, fields, image);
            res.json({ success: true, message: 'Halaman berhasil diperbarui.', book });
        } catch (fatalErr) {
            console.error('[flipbookContent] Error tak terduga (edit halaman):', fatalErr);
            if (!res.headersSent) {
                res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

// Tambah halaman isi baru di akhir buku tertentu.
// Body (multipart/form-data, gak ada file): bookIndex, password.
router.post('/page/add', upload.none(), async (req, res) => {
    try {
        if (!(await guardPassword(req, res))) return;

        const bookIndex = parseInt(req.body.bookIndex, 10);
        if (Number.isNaN(bookIndex)) {
            return res.status(400).json({ success: false, message: 'Buku yang dituju tidak dikenali.' });
        }

        const book = await store.addPage(bookIndex);
        res.json({ success: true, message: 'Halaman baru berhasil ditambahkan.', book });
    } catch (fatalErr) {
        console.error('[flipbookContent] Error tak terduga (tambah halaman):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menambah halaman.' });
        }
    }
});

module.exports = router;