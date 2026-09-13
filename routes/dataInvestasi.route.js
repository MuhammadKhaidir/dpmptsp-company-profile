// routes/dataInvestasi.route.js
//
// Router buat halaman Data Investasi: satu dokumen PDF aktif yang
// ditampilkan penuh di halaman (lihat DataInvestasiPage.js). Upload/hapus
// cuma bisa admin -- ngikutin pola sama persis kayak routes/qrDoc.js:
// sesi login admin (middleware/requireAdmin.js), berkas di Vercel Blob,
// metadata di Upstash Redis (lihat data/dataInvestasiStore.js).

const express = require('express');
const multer = require('multer');

const store = require('../data/dataInvestasiStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const MAX_FILE_SIZE = 4 * 1024 * 1024; // batas body Vercel Functions ~4.5MB, disisain jarak aman

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            cb(new Error('Format berkas tidak didukung. Hanya PDF yang diterima.'));
            return;
        }
        cb(null, true);
    }
});

// Publik -- dipanggil DataInvestasiPage.js buat nampilin dokumen aktif.
router.get('/', async (req, res) => {
    try {
        const entry = await store.getPdf();
        res.json({
            success: true,
            pdfUrl: entry ? entry.url : null,
            originalName: entry ? entry.originalName : null,
            updatedAt: entry ? entry.updatedAt : null
        });
    } catch (err) {
        console.error('[dataInvestasi] Gagal ambil dokumen:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Admin upload / ganti dokumen PDF yang aktif.
router.post('/upload', requireAdmin, (req, res) => {
    upload.single('pdf')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'File PDF wajib diisi.' });
            }

            const entry = await store.setPdf({
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                originalName: req.file.originalname
            });

            res.json({
                success: true,
                message: 'Dokumen berhasil diunggah.',
                pdfUrl: entry.url,
                originalName: entry.originalName,
                updatedAt: entry.updatedAt
            });
        } catch (fatalErr) {
            console.error('[dataInvestasi] Error tak terduga (upload):', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat mengunggah dokumen.' });
            }
        }
    });
});

// Admin hapus dokumen yang lagi aktif -- balik kosong sampai admin
// upload lagi yang baru.
router.post('/delete', requireAdmin, async (req, res) => {
    try {
        await store.clearPdf();
        res.json({ success: true, message: 'Dokumen berhasil dihapus.' });
    } catch (err) {
        console.error('[dataInvestasi] Gagal hapus dokumen:', err);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menghapus dokumen.' });
    }
});

module.exports = router;