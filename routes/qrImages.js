// routes/qrImages.js
//
// Router Express untuk fitur "ganti gambar & judul kode QR". Endpoint &
// URL dipertahankan sama persis (GET /api/qr-images/meta,
// GET /api/qr-images/file/:slot, POST /api/qr-images/:slot) -- frontend
// (QRCodeRevealAnimation.js) gak perlu diubah bentuk request-nya, cuma
// gak kirim field 'password' lagi.
//
// BARU: password per-aksi (QR_EDIT_PASSWORD) DICABUT TOTAL, digantikan
// sesi login admin (lihat middleware/requireAdmin.js) -- konsisten sama
// routes/arcCarouselContent.js, qrBg.js, qrDoc.js. Ikut kecabut juga
// SELURUH mekanisme lockout/rate-limit per-IP (checkLockout,
// registerFailedAttempt, dkk) -- itu dulu dibikin khusus buat nahan
// orang nebak-nebak password lewat endpoint ini, sekarang gak relevan
// lagi karena gak ada password yang bisa ditebak di sini sama sekali.
// (Percobaan login yang gagal sekarang jadi urusan /api/auth/login di
// routes/auth.js, bukan di sini -- itu di luar cakupan perubahan ini.)
//
// Env var QR_EDIT_PASSWORD jadi gak kepakai lagi di file ini -- aman
// dibiarin nganggur di Environment Variables Vercel, atau dihapus kalau
// mau beres-beres, dua-duanya gak ngaruh ke jalannya fitur ini.

const express = require('express');
const multer = require('multer');

const store = require('../data/qrImageStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80; // ubah di sini kalau perlu batas karakter judul berbeda
const MAX_DESCRIPTION_LENGTH = 240; // samain sama maxlength textarea deskripsi di frontend

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

// GET /api/qr-images/meta -- publik, siapa aja boleh baca (dipakai buat
// nampilin gambar/judul custom ke SEMUA pengunjung, bukan cuma admin).
router.get('/meta', async (req, res) => {
    try {
        const meta = await store.getMeta();
        res.json({ success: true, meta });
    } catch (err) {
        console.error('[qrImages] Gagal ambil meta:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// GET /api/qr-images/file/:slot -- publik juga, ini yang nampilin gambar
// QR-nya sendiri ke pengunjung biasa.
router.get('/file/:slot', async (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    try {
        const entry = await store.getSlotImage(slot);
        if (!entry || !entry.url) {
            return res.status(404).json({ success: false, message: 'Belum terdapat gambar khusus untuk slot ini.' });
        }
        res.redirect(302, entry.url);
    } catch (err) {
        console.error('[qrImages] Gagal ambil file:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil berkas dari server.' });
    }
});

// POST /api/qr-images/:slot -- BARU: requireAdmin dipasang PALING DEPAN,
// sebelum handler apa pun jalan. Kalau bukan admin yang login, request
// ditolak duluan sebelum sempat parsing multipart body / sentuh slot
// sama sekali -- pola sama persis kayak routes/arcCarouselContent.js.
router.post('/:slot', requireAdmin, (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('image')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            const { title, description } = req.body;
            const trimmedTitle = typeof title === 'string' ? title.trim() : '';
            const trimmedDescription = typeof description === 'string' ? description.trim() : '';

            if (trimmedTitle.length > MAX_TITLE_LENGTH) {
                return res.status(400).json({
                    success: false,
                    message: `Judul terlalu panjang (maksimal ${MAX_TITLE_LENGTH} karakter).`
                });
            }

            if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
                return res.status(400).json({
                    success: false,
                    message: `Deskripsi terlalu panjang (maksimal ${MAX_DESCRIPTION_LENGTH} karakter).`
                });
            }

            if (!req.file && !trimmedTitle && !trimmedDescription) {
                return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar, judul, atau deskripsi baru yang dikirim.' });
            }

            let entry;
            if (req.file) {
                const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
                entry = await store.setSlotImage(slot, {
                    buffer: req.file.buffer,
                    mimeType: req.file.mimetype,
                    ext,
                    title: trimmedTitle || undefined,
                    description: trimmedDescription || undefined
                });
            } else {
                entry = await store.setSlotTitle(slot, trimmedTitle || undefined, trimmedDescription || undefined);
            }

            res.json({
                success: true,
                message: 'Perubahan berhasil disimpan.',
                entry
            });
        } catch (fatalErr) {
            console.error('[qrImages] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

module.exports = router;