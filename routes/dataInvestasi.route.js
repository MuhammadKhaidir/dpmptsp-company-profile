// routes/dataInvestasi.route.js
//
// Router buat halaman Data Investasi: SEKARANG BISA LEBIH DARI SATU
// tab/halaman, masing-masing nyimpen satu dokumen PDF aktif yang
// ditampilkan penuh (lihat DataInvestasiPage.js). Tambah/ganti-nama/hapus
// tab, dan upload/hapus PDF per tab, cuma bisa admin -- ngikutin pola
// sama persis kayak routes/flipbookContent.js: sesi login admin
// (middleware/requireAdmin.js), berkas di Vercel Blob, metadata di
// Upstash Redis (lihat data/dataInvestasiStore.js).

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

function parseIndex(value) {
    const idx = parseInt(value, 10);
    return Number.isNaN(idx) ? null : idx;
}

// Publik -- dipanggil DataInvestasiPage.js buat nampilin seluruh tab +
// dokumen aktif di masing-masing tab.
router.get('/', async (req, res) => {
    try {
        const pages = await store.getPages();
        res.json({ success: true, pages });
    } catch (err) {
        console.error('[dataInvestasi] Gagal ambil data:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Admin tambah tab/halaman baru (kosong, belum ada PDF).
router.post('/page/add', requireAdmin, upload.none(), async (req, res) => {
    try {
        const pages = await store.addPage();
        res.json({ success: true, message: 'Halaman baru berhasil ditambahkan.', pages });
    } catch (fatalErr) {
        console.error('[dataInvestasi] Error tak terduga (tambah halaman):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menambah halaman.' });
        }
    }
});

// Admin ganti nama (label) satu tab.
// Body (multipart/form-data, gak ada file): pageIndex, label.
router.post('/page/rename', requireAdmin, upload.none(), async (req, res) => {
    try {
        const pageIndex = parseIndex(req.body.pageIndex);
        if (pageIndex === null) {
            return res.status(400).json({ success: false, message: 'Halaman yang dituju tidak dikenali.' });
        }

        const pages = await store.renamePage(pageIndex, req.body.label);
        res.json({ success: true, message: 'Nama halaman berhasil diperbarui.', pages });
    } catch (fatalErr) {
        console.error('[dataInvestasi] Error tak terduga (ganti nama halaman):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat mengganti nama halaman.' });
        }
    }
});

// Admin hapus SATU TAB secara keseluruhan (beserta PDF-nya kalau ada).
// Gak boleh hapus tab terakhir -- dicek di dataInvestasiStore.js.
// Body (multipart/form-data, gak ada file): pageIndex.
router.post('/page/delete', requireAdmin, upload.none(), async (req, res) => {
    try {
        const pageIndex = parseIndex(req.body.pageIndex);
        if (pageIndex === null) {
            return res.status(400).json({ success: false, message: 'Halaman yang dituju tidak dikenali.' });
        }

        const pages = await store.deletePage(pageIndex);
        res.json({ success: true, message: 'Halaman berhasil dihapus.', pages });
    } catch (fatalErr) {
        console.error('[dataInvestasi] Error tak terduga (hapus halaman):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat menghapus halaman.' });
        }
    }
});

// Admin upload / ganti dokumen PDF yang aktif buat SATU tab tertentu.
// Body (multipart/form-data): pageIndex, berkas di field 'pdf'.
router.post('/upload', requireAdmin, (req, res) => {
    upload.single('pdf')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'File PDF wajib diisi.' });
            }

            const pageIndex = parseIndex(req.body.pageIndex);
            if (pageIndex === null) {
                return res.status(400).json({ success: false, message: 'Halaman yang dituju tidak dikenali.' });
            }

            const pages = await store.setPagePdf(pageIndex, {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                originalName: req.file.originalname
            });

            res.json({
                success: true,
                message: 'Dokumen berhasil diunggah.',
                pages
            });
        } catch (fatalErr) {
            console.error('[dataInvestasi] Error tak terduga (upload):', fatalErr);
            if (!res.headersSent) {
                res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat mengunggah dokumen.' });
            }
        }
    });
});

// Admin hapus dokumen PDF SATU tab -- tab-nya SENDIRI tetap ada, cuma
// balik jadi kosong lagi (siap diisi PDF baru lagi).
// Body (multipart/form-data, gak ada file): pageIndex.
router.post('/delete', requireAdmin, upload.none(), async (req, res) => {
    try {
        const pageIndex = parseIndex(req.body.pageIndex);
        if (pageIndex === null) {
            return res.status(400).json({ success: false, message: 'Halaman yang dituju tidak dikenali.' });
        }

        const pages = await store.clearPagePdf(pageIndex);
        res.json({ success: true, message: 'Dokumen berhasil dihapus.', pages });
    } catch (fatalErr) {
        console.error('[dataInvestasi] Gagal hapus dokumen:', fatalErr);
        res.status(fatalErr.statusCode || 500).json({ success: false, message: 'Terjadi kesalahan pada server saat menghapus dokumen.' });
    }
});

module.exports = router;