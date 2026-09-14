// routes/kontak.route.js
//
// Router buat info kontak (Alamat, Telepon, Email, Jam Pelayanan) yang
// ditampilkan di KontakPage.js. GET publik buat nampilin datanya, admin
// bisa update isi tiap item lewat sesi login (middleware/requireAdmin.js)
// -- data disimpan di Upstash Redis (lihat data/kontakStore.js).

const express = require('express');
const multer = require('multer');

const store = require('../data/kontakStore');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

// Gak ada berkas yang diunggah di sini, cuma field teks biasa
// (multipart/form-data dari FormData di frontend).
const upload = multer();

// Publik -- dipanggil KontakPage.js buat nampilin info kontak.
router.get('/', async (req, res) => {
    try {
        const items = await store.getItems();
        res.json({ success: true, items });
    } catch (err) {
        console.error('[kontak] Gagal ambil data:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data dari server.' });
    }
});

// Admin update isi (lines) satu item kontak.
// Body (multipart/form-data): id, lines (dikirim sebagai JSON string
// array -- lihat KontakPage.js submitEdit()).
router.post('/update', requireAdmin, upload.none(), async (req, res) => {
    try {
        const { id, lines } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'Info kontak yang dituju tidak dikenali.' });
        }

        let parsedLines;
        try {
            parsedLines = JSON.parse(lines);
        } catch (e) {
            // fallback jaga-jaga kalau frontend ngirim teks polos dipisah newline
            parsedLines = String(lines || '').split('\n');
        }

        const items = await store.updateItemLines(id, parsedLines);
        res.json({ success: true, message: 'Info kontak berhasil diperbarui.', items });
    } catch (fatalErr) {
        console.error('[kontak] Error tak terduga (update):', fatalErr);
        if (!res.headersSent) {
            res.status(fatalErr.statusCode || 500).json({ success: false, message: fatalErr.message || 'Terjadi kesalahan pada server saat memperbarui info kontak.' });
        }
    }
});

module.exports = router;
