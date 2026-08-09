// routes/qrBg.js
//
// Router Express untuk fitur "ganti gambar LATAR BELAKANG di belakang
// kotak QR". Endpoint & URL SENGAJA dipertahankan bentuknya sama persis
// kayak sebelumnya (/api/qr-bg/meta, /api/qr-bg/file/:slot,
// POST /api/qr-bg/:slot) -- biar frontend (QRCodeRevealAnimation.js) gak
// perlu diubah bentuk request-nya, cuma gak kirim field 'password' lagi.
//
// BARU: password per-aksi (QR_EDIT_PASSWORD) DICABUT TOTAL, digantikan
// sesi login admin (lihat middleware/requireAdmin.js) -- konsisten sama
// routes/arcCarouselContent.js, qrImages.js, qrDoc.js. Ikut kecabut juga
// SELURUH mekanisme lockout/rate-limit per-IP -- dulu dibikin khusus
// buat nahan orang nebak-nebak password lewat endpoint ini, sekarang gak
// relevan lagi karena gak ada password yang bisa ditebak di sini.

const express = require('express');
const multer = require('multer');

const store = require('../data/qrBgStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Diturunin dari 5MB -> 4MB, sama alasannya kayak di routes/qrImages.js:
// Vercel Functions punya limit ukuran body request sekitar 4.5MB.
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

router.get('/meta', async (req, res) => {
    try {
        const meta = await store.getMeta();
        res.json({ success: true, meta });
    } catch (err) {
        console.error('[qrBg] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Redirect ke URL Blob yang sedang aktif -- CSS background-image & <img>
// otomatis ikutin redirect ini, gak ada yang perlu diubah di frontend.
router.get('/file/:slot', async (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    try {
        const entry = await store.getSlotImage(slot);
        if (!entry || !entry.url) {
            return res.status(404).json({ success: false, message: 'Belum terdapat gambar latar khusus untuk slot ini.' });
        }
        res.redirect(302, entry.url);
    } catch (err) {
        console.error('[qrBg] Gagal ambil file:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil berkas dari server.' });
    }
});

// BARU: requireAdmin dipasang PALING DEPAN, sebelum handler apa pun
// jalan -- pola sama persis kayak routes/arcCarouselContent.js &
// routes/qrImages.js.
router.post('/:slot', requireAdmin, (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('image')(req, res, async (uploadErr) => {
        // Seluruh isi callback dibungkus try/catch -- apa pun yang meleset
        // (Blob/Redis gagal diakses, dll) SELALU kirim response JSON,
        // bukan bikin function mati diam-diam (itu penyebab ERR_EMPTY_RESPONSE
        // yang kejadian kemarin).
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar yang dikirim.' });
            }

            const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const entry = await store.setSlotImage(slot, {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                ext
            });

            res.json({ success: true, message: 'Gambar latar berhasil diperbarui.', entry });
        } catch (fatalErr) {
            console.error('[qrBg] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;