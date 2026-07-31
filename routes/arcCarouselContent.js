// routes/arcCarouselContent.js
// Route API buat fitur Tambah/Hapus Buku di ArcCarousel.
// Endpoint ini yang dipanggil sama public/js/Arccarousel.js:
//   GET  /api/arc-carousel/content
//   POST /api/arc-carousel/book/add
//   POST /api/arc-carousel/book/delete

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const store = require('../data/arcCarouselStore');

const router = express.Router();

// Ganti default ini lewat .env (ARC_CAROUSEL_PASSWORD=...).
// Kalau mau pakai password yang sama kayak fitur edit FlipBook/QR,
// tinggal samain nama env var-nya biar satu password buat semua.
const ARC_CAROUSEL_PASSWORD = process.env.ARC_CAROUSEL_PASSWORD || 'admin123';

// Folder penyimpanan PDF upload. Ditaruh di dalam Assets/ biar otomatis
// ke-serve lewat static route '/assets' yang udah ada di server.js.
const UPLOAD_DIR = path.join(__dirname, '..', 'Assets', 'books');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safeBase = path
            .parse(file.originalname)
            .name.replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 60);
        const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cb(null, `${safeBase}-${unique}.pdf`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // maks 20MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Berkas harus berformat PDF.'));
        }
        cb(null, true);
    }
});

// GET /api/arc-carousel/content
router.get('/content', (req, res) => {
    try {
        const books = store.getBooks();
        res.json({ success: true, books });
    } catch (err) {
        console.error('[arcCarouselContent] Gagal ambil daftar buku:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar buku.' });
    }
});

// POST /api/arc-carousel/book/add  (multipart/form-data: title, password, pdf?)
router.post('/book/add', (req, res) => {
    upload.single('pdf')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Gagal upload PDF.' });
        }

        const { title, password } = req.body;

        if (password !== ARC_CAROUSEL_PASSWORD) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(401).json({ success: false, message: 'Kata sandi salah.' });
        }

        if (!title || !title.trim()) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ success: false, message: 'Judul buku wajib diisi.' });
        }

        const pdfUrl = req.file ? `/assets/books/${req.file.filename}` : '';

        try {
            const book = store.addBook({ title: title.trim(), pdfUrl });
            res.json({ success: true, book });
        } catch (storeErr) {
            console.error('[arcCarouselContent] Gagal simpan buku:', storeErr);
            res.status(500).json({ success: false, message: 'Gagal menyimpan buku.' });
        }
    });
});

// POST /api/arc-carousel/book/delete  (multipart/form-data: id, password)
// Pakai upload.none() karena frontend ngirim FormData (bukan JSON biasa),
// jadi harus lewat multer walau gak ada file yang diupload.
router.post('/book/delete', upload.none(), (req, res) => {
    const { id, password } = req.body;

    if (password !== ARC_CAROUSEL_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Kata sandi salah.' });
    }
    if (!id) {
        return res.status(400).json({ success: false, message: 'ID buku tidak ditemukan.' });
    }

    try {
        const books = store.getBooks();
        const target = books.find((b) => b.id === id);

        const removed = store.deleteBook(id);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'Buku tidak ditemukan.' });
        }

        // Hapus file PDF fisiknya juga kalau ada.
        if (target && target.pdfUrl) {
            const filename = path.basename(target.pdfUrl);
            const filePath = path.join(UPLOAD_DIR, filename);
            fs.unlink(filePath, () => {});
        }

        res.json({ success: true, id });
    } catch (err) {
        console.error('[arcCarouselContent] Gagal hapus buku:', err);
        res.status(500).json({ success: false, message: 'Gagal menghapus buku.' });
    }
});

module.exports = router;