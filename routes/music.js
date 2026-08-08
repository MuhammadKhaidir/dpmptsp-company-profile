// routes/music.js
//
// Endpoint & URL SENGAJA dipertahankan sama persis (/api/music/list,
// /api/music/file/:slot, POST & DELETE /api/music/:slot) -- endpoint-nya
// gak berubah, tapi otorisasinya sekarang sesi admin (lihat requireAdmin
// di bawah), bukan lagi password manual.
//
// CATATAN soal /file/:slot: dulu route ini streaming byte manual pakai
// Range header (buat fitur seek/scrubbing). Sekarang cukup REDIRECT ke
// URL Vercel Blob -- elemen <audio> otomatis ikutin redirect, dan Range
// request buat seek tetap jalan normal langsung ke Blob-nya (Vercel Blob
// mendukung Range request secara native), jadi gak ada fungsi yang hilang.
//
// BARU: password per-aksi (QR_EDIT_PASSWORD) DICABUT, digantikan sesi
// login admin (lihat middleware/requireAdmin.js), konsisten sama route
// edit lainnya.

const express = require('express');
const multer = require('multer');

const store = require('../data/musicStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

const ALLOWED_MIME = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'
]);
// PENTING: diturunin dari 15MB -> 4MB karena limit body request Vercel
// Functions (~4.5MB). Lagu yang lumayan besar bisa ketolak -- lihat catatan
// di atas soal solusi "client upload" kalau ini kerasa kekecilan.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TITLE_LENGTH = 80;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(new Error('Format berkas tidak didukung. Gunakan MP3, WAV, OGG, M4A, atau WEBM.'));
            return;
        }
        cb(null, true);
    }
});

router.get('/list', async (req, res) => {
    try {
        const tracks = await store.getPublicList();
        res.json({ success: true, tracks });
    } catch (err) {
        console.error('[music] Gagal ambil list:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

router.get('/file/:slot', async (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    try {
        const entry = await store.getSlotTrack(slot);
        if (!entry || !entry.url) {
            return res.status(404).json({ success: false, message: 'Slot ini belum memiliki lagu.' });
        }
        res.redirect(302, entry.url);
    } catch (err) {
        console.error('[music] Gagal ambil file:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil berkas dari server.' });
    }
});

router.post('/:slot', requireAdmin, (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    upload.single('audio')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) {
                return res.status(400).json({ success: false, message: uploadErr.message || 'Proses pengunggahan gagal.' });
            }

            const { title } = req.body;

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Tidak ada berkas lagu yang dikirim.' });
            }

            const cleanTitle = String(title || '').trim().slice(0, MAX_TITLE_LENGTH) ||
                req.file.originalname.replace(/\.[^/.]+$/, '');

            const ext = (req.file.mimetype.split('/')[1] || 'mp3')
                .replace('mpeg', 'mp3')
                .replace('x-m4a', 'm4a')
                .replace('x-wav', 'wav');

            const entry = await store.setSlotTrack(slot, {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                ext,
                title: cleanTitle
            });

            res.json({ success: true, message: 'Lagu berhasil disimpan.', entry });
        } catch (fatalErr) {
            console.error('[music] Error tak terduga:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menyimpan perubahan.' });
            }
        }
    });
});

router.delete('/:slot', requireAdmin, (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    (async () => {
        try {
            await store.clearSlotTrack(slot);
            res.json({ success: true, message: 'Lagu berhasil dihapus.' });
        } catch (fatalErr) {
            console.error('[music] Error tak terduga saat hapus:', fatalErr);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat menghapus lagu.' });
            }
        }
    })();
});

module.exports = router;