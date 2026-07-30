// routes/flipbook.js
//
// Router Express buat panel admin flipbook: nambah/edit/hapus halaman,
// ganti gambar per halaman, ubah judul & sampul buku. Mengikuti pola
// yang SAMA kayak routes/qrBg.js -- password lewat QR_EDIT_PASSWORD,
// rate limit percobaan gagal lewat Redis, upload gambar lewat multer +
// Vercel Blob.
//
// Endpoint:
//   GET  /api/flipbook/books
//     Publik (TANPA password) -- dipakai flipbook-scroll.js buat
//     nampilin buku ke semua pengunjung situs, cuma baca.
//
//   POST /api/flipbook/:bookIndex/save
//     Perlu password -- nyimpen SATU BUKU UTUH (judul + sampul + semua
//     halaman) sekaligus. Body multipart/form-data:
//       password  -> string
//       bookData  -> JSON string { title, cover, backCover, content[] }.
//                    Kalau salah satu content[i].image.src bernilai
//                    '@@NEW_IMAGE@@', berarti gambar halaman itu BARU
//                    diganti/ditambah, dan file-nya HARUS ikut dikirim
//                    lewat field bernama image_<i> (i = index halaman
//                    di array content, dimulai dari 0).
//       image_0, image_1, dst -> file gambar (opsional, sesuai di atas)

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const store = require('../data/flipbookStore');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 4 * 1024 * 1024; // sama kayak routes/qrBg.js -- limit body Vercel Functions ~4.5MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(new Error('Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.'));
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

// Password dipakai BARENG sama fitur qrBg (QR_EDIT_PASSWORD) -- satu
// kata sandi admin buat semua panel edit di situs ini. Kalau mau
// dipisah, ganti ke env var baru sendiri, misalnya FLIPBOOK_EDIT_PASSWORD.
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

router.get('/books', async (req, res) => {
    try {
        const books = await store.getAllBooks();
        res.json({ success: true, books });
    } catch (err) {
        console.error('[flipbook] Gagal ambil daftar buku:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

router.post('/:bookIndex/save', (req, res) => {
    const bookIndex = Number(req.params.bookIndex);
    if (!store.isValidBookIndex(bookIndex)) {
        return res.status(404).json({ success: false, message: 'Buku tidak dikenali.' });
    }

    // .any() dipakai karena nama field gambar dinamis (image_0, image_1,
    // dst, sesuai index halaman yang gambarnya baru diganti/ditambah).
    upload.any()(req, res, async (uploadErr) => {
        // Seluruh isi callback dibungkus try/catch, sama kayak routes/qrBg.js
        // -- apa pun yang meleset SELALU kirim response JSON, bukan bikin
        // function mati diam-diam.
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!(await checkLockout(req, res))) return;

            const { password, bookData } = req.body;
            const verdict = verifyPassword(password);

            if (!verdict.ok) {
                await registerFailedAttempt(req);
                if (verdict.reason === 'not-configured') {
                    return res.status(500).json({
                        success: false,
                        message: 'Fitur edit belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada Environment Variables server terlebih dahulu.'
                    });
                }
                return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
            }

            await clearFailedAttempts(req);

            if (!bookData) {
                return res.status(400).json({ success: false, message: 'Data buku tidak dikirim.' });
            }

            let parsed;
            try {
                parsed = JSON.parse(bookData);
            } catch (parseErr) {
                return res.status(400).json({ success: false, message: 'Format data buku tidak valid.' });
            }

            if (!Array.isArray(parsed.content)) parsed.content = [];

            // File gambar baru masuk lewat upload.any() dengan nama field
            // "image_<indexHalaman>". Tiap halaman yang field image.src-nya
            // bertanda '@@NEW_IMAGE@@' berarti minta gambar barunya diambil
            // dari file dengan nama field tersebut.
            const filesByField = {};
            (req.files || []).forEach((f) => { filesByField[f.fieldname] = f; });

            for (let i = 0; i < parsed.content.length; i++) {
                const page = parsed.content[i];
                if (page && page.image && page.image.src === '@@NEW_IMAGE@@') {
                    const file = filesByField[`image_${i}`];
                    if (!file) {
                        // Ditandai baru tapi filenya gak ketemu -- daripada
                        // nyimpen data rusak (src berupa marker string),
                        // hapus aja field image-nya.
                        page.image = null;
                        continue;
                    }
                    const ext = (file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
                    const uploaded = await store.uploadPageImage(bookIndex, `p${i}`, {
                        buffer: file.buffer,
                        mimeType: file.mimetype,
                        ext
                    });
                    page.image.src = uploaded.url;
                    page.image.pathname = uploaded.pathname;
                }
            }

            const saved = await store.saveBook(bookIndex, parsed);
            res.json({ success: true, message: 'Buku berhasil disimpan.', book: saved });
        } catch (fatalErr) {
            console.error('[flipbook] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;