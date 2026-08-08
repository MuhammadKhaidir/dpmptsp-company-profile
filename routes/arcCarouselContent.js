// routes/arcCarouselContent.js
//
// Router Express untuk fitur Tambah/Edit/Hapus Buku di ArcCarousel.
// Endpoint dipertahankan sama persis buat add & delete (GET
// /api/arc-carousel/content, POST /api/arc-carousel/book/add,
// POST /api/arc-carousel/book/delete) -- otorisasinya sesi admin
// (lihat requireAdmin di bawah), bukan lagi password manual.
//
// FIX lama: sebelumnya route ini manggil store.addBook({ title, file })
// padahal data/arcCarouselStore.js definisinya addBook(title, pdf) -- dua
// argumen terpisah, bukan satu object. Sudah disesuaikan.
//
// BARU: POST /api/arc-carousel/book/edit (multipart/form-data:
// id, title, pdf?) -- sebelumnya cuma bisa Tambah & Hapus, sekarang
// bisa update judul & (opsional) ganti berkas PDF buku yang UDAH ada,
// tanpa perlu hapus-lalu-tambah-ulang. Pola handler-nya SAMA PERSIS
// kayak /book/add (requireAdmin duluan, lalu multer di-wrap manual
// biar error upload ke-handle rapi sebelum logic lain jalan).
//
// Password per-aksi (ARC_CAROUSEL_EDIT_PASSWORD / QR_EDIT_PASSWORD)
// DICABUT, digantikan sesi login admin (lihat middleware/requireAdmin.js),
// konsisten sama routes/qrImages.js, qrBg.js, qrDoc.js.

const express = require('express');
const multer = require('multer');

const store = require('../data/arcCarouselStore');
const requireAdmin = require('../middleware/requireAdmin');

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

// GET /api/arc-carousel/content -- publik, siapa aja boleh baca.
router.get('/content', async (req, res) => {
    try {
        const books = await store.getBooks();
        res.json({ success: true, books });
    } catch (err) {
        console.error('[arcCarouselContent] Gagal ambil daftar buku:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar buku dari server.' });
    }
});

// POST /api/arc-carousel/book/add  (multipart/form-data: title, pdf?)
// requireAdmin dipasang PALING DEPAN -- kalau bukan admin yang login,
// request ditolak sebelum sempat parsing multipart body sama sekali.
router.post('/book/add', requireAdmin, (req, res) => {
    upload.single('pdf')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

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

// BARU: POST /api/arc-carousel/book/edit  (multipart/form-data: id, title, pdf?)
// Struktur handler-nya sengaja dibikin identik sama /book/add di atas
// (requireAdmin duluan, multer di-wrap manual) biar konsisten & gampang
// dirawat bareng. pdf bersifat opsional: kalau field-nya kosong (gak ada
// req.file), store.editBook() bakal PERTAHANKAN pdfUrl/pdfPathname lama
// apa adanya -- cuma title yang pasti diganti.
router.post('/book/edit', requireAdmin, (req, res) => {
    upload.single('pdf')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            const { id } = req.body;
            const title = (req.body.title || '').trim();

            if (!id) {
                return res.status(400).json({ success: false, message: 'ID buku tidak ditemukan.' });
            }
            if (!title) {
                return res.status(400).json({ success: false, message: 'Judul buku wajib diisi.' });
            }

            const pdf = req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : null;

            const book = await store.editBook(id, title, pdf);

            res.json({ success: true, message: 'Buku berhasil diperbarui.', book });
        } catch (fatalErr) {
            console.error('[arcCarouselContent] Error tak terduga saat edit buku:', fatalErr);
            if (!res.headersSent) {
                res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat mengedit buku.' });
            }
        }
    });
});

// POST /api/arc-carousel/book/delete  (multipart/form-data: id)
router.post('/book/delete', requireAdmin, upload.none(), async (req, res) => {
    try {
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