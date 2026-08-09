// routes/qrDoc.js
//
// Router Express untuk fitur "dokumen terkait" per kotak QR (tautan
// website atau berkas PDF yang dibuka lewat tombol "Lihat Dokumen
// Terkait"). Endpoint & URL dipertahankan sama persis (GET
// /api/qr-doc/meta, POST /api/qr-doc/:slot) -- frontend
// (QRCodeRevealAnimation.js) gak perlu diubah bentuk request-nya, cuma
// gak kirim field 'password' lagi.
//
// BARU: password per-aksi (QR_EDIT_PASSWORD) DICABUT TOTAL, digantikan
// sesi login admin (lihat middleware/requireAdmin.js) -- konsisten sama
// routes/arcCarouselContent.js, qrImages.js, qrBg.js. Ikut kecabut juga
// SELURUH mekanisme lockout/rate-limit per-IP -- dulu dibikin khusus
// buat nahan orang nebak-nebak password lewat endpoint ini, sekarang gak
// relevan lagi karena gak ada password yang bisa ditebak di sini.

const express = require('express');
const multer = require('multer');

const store = require('../data/qrDocStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const ALLOWED_MIME = new Set(['application/pdf']);
const MAX_FILE_SIZE = 4 * 1024 * 1024; // Samain sama batas gambar QR (4MB) biar konsisten sama batas 4.5MB Vercel.
const MAX_URL_LENGTH = 2000;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(new Error('Format berkas tidak didukung. Hanya PDF yang diterima.'));
            return;
        }
        cb(null, true);
    }
});

function isValidHttpUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

router.get('/meta', async (req, res) => {
    try {
        const meta = await store.getMeta();
        res.json({ success: true, meta });
    } catch (err) {
        console.error('[qrDoc] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// BARU: requireAdmin dipasang PALING DEPAN, sebelum handler apa pun
// jalan -- pola sama persis kayak routes/arcCarouselContent.js,
// qrImages.js, qrBg.js.
router.post('/:slot', requireAdmin, (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('document')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            const { mode, url } = req.body;

            // mode 'clear' -> hapus dokumen terkait, balik ke fallback flip book.
            if (mode === 'clear') {
                await store.clearSlotDoc(slot);
                return res.json({ success: true, message: 'Dokumen terkait berhasil dihapus.', entry: null });
            }

            if (mode === 'pdf') {
                if (!req.file) {
                    return res.status(400).json({ success: false, message: 'Tidak ada berkas PDF yang dikirim.' });
                }
                const entry = await store.setSlotDocFile(slot, {
                    buffer: req.file.buffer,
                    mimeType: req.file.mimetype,
                    ext: 'pdf'
                });
                return res.json({ success: true, message: 'Perubahan berhasil disimpan.', entry });
            }

            if (mode === 'link') {
                const trimmedUrl = typeof url === 'string' ? url.trim() : '';
                if (!trimmedUrl) {
                    return res.status(400).json({ success: false, message: 'Tautan tidak boleh kosong.' });
                }
                if (trimmedUrl.length > MAX_URL_LENGTH) {
                    return res.status(400).json({ success: false, message: 'Tautan terlalu panjang.' });
                }
                if (!isValidHttpUrl(trimmedUrl)) {
                    return res.status(400).json({ success: false, message: 'Tautan tidak valid. Gunakan format lengkap, contoh: https://contoh.go.id/dokumen' });
                }
                const entry = await store.setSlotDocLink(slot, trimmedUrl);
                return res.json({ success: true, message: 'Perubahan berhasil disimpan.', entry });
            }

            return res.status(400).json({ success: false, message: 'Mode tidak dikenali.' });
        } catch (fatalErr) {
            console.error('[qrDoc] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;