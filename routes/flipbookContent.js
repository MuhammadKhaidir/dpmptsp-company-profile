// routes/flipbookContent.js
//
// Router Express untuk fitur EDIT KONTEN FlipBook per halaman (ganti
// tulisan, ganti/tambah gambar per halaman), TAMBAH HALAMAN BARU, dan
// HAPUS BUKU. Upload gambar lewat Vercel Blob, data teks lewat Upstash
// Redis (via data/flipbookStore.js).
//
// BARU: password per-aksi (FLIPBOOK_EDIT_PASSWORD / QR_EDIT_PASSWORD)
// DICABUT, digantikan sesi login admin (lihat middleware/requireAdmin.js),
// konsisten sama routes/qrImages.js, qrBg.js, qrDoc.js, arcCarouselContent.js.

const express = require('express');
const multer = require('multer');

const store = require('../data/flipbookStore');
const requireAdmin = require('../middleware/requireAdmin');

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

// Publik -- siapa aja boleh baca konten buku, gak perlu login.
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
// contentIndex (wajib kalau leafType='content'), lalu field teks sesuai
// jenis halaman (kicker/heading/body/tagline/page), dan file opsional di
// field 'image'.
router.post('/page', requireAdmin, (req, res) => {
    upload.single('image')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

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
// Body (multipart/form-data, gak ada file): bookIndex.
router.post('/page/add', requireAdmin, upload.none(), async (req, res) => {
    try {
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

// Hapus satu halaman isi dari sebuah buku.
// Body (multipart/form-data, gak ada file): bookIndex, contentIndex.
router.post('/page/delete', requireAdmin, upload.none(), async (req, res) => {
    try {
        const bookIndex = parseInt(req.body.bookIndex, 10);
        const contentIndex = parseInt(req.body.contentIndex, 10);
        if (Number.isNaN(bookIndex) || Number.isNaN(contentIndex)) {
            return res.status(400).json({ success: false, message: 'Halaman yang dituju tidak dikenali.' });
        }

        const book = await store.deletePage(bookIndex, contentIndex);
        res.json({ success: true, message: 'Halaman berhasil dihapus.', book });
    } catch (fatalErr) {
        console.error('[flipbookContent] Error tak terduga (hapus halaman):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menghapus halaman.' });
        }
    }
});

// Hapus satu buku secara keseluruhan.
// Body (multipart/form-data, gak ada file): bookIndex.
router.post('/book/delete', requireAdmin, upload.none(), async (req, res) => {
    try {
        const bookIndex = parseInt(req.body.bookIndex, 10);
        if (Number.isNaN(bookIndex)) {
            return res.status(400).json({ success: false, message: 'Buku yang dituju tidak dikenali.' });
        }

        const books = await store.deleteBook(bookIndex);
        res.json({ success: true, message: 'Buku berhasil dihapus.', books });
    } catch (fatalErr) {
        console.error('[flipbookContent] Error tak terduga (hapus buku):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menghapus buku.' });
        }
    }
});

module.exports = router;