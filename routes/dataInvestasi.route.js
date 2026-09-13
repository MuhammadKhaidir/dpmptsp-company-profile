/**
 * routes/dataInvestasi.route.js
 *
 * Contoh endpoint buat halaman Data Investasi.
 * Ini GENERIC — sesuaikan sama cara koneksi DB (TiDB/MySQL) & middleware
 * admin-auth yang udah lo punya di project. Ganti nama tabel/kolom kalau perlu.
 *
 * Kalau lo punya route serupa yang udah jalan (misal buat upload QR code image),
 * kasih liat filenya, biar gw samain persis pola-nya biar konsisten sama codebase lo.
 */

const express = require('express');
const multer = require('multer');
const { put } = require('@vercel/blob');
const router = express.Router();

// simpen file sementara di memory sebelum di-upload ke Vercel Blob
const upload = multer({ storage: multer.memoryStorage() });

// TODO: ganti ini pake middleware admin-auth (session) yang udah lo bikin
const requireAdmin = require('../iddleware/requireAdmin.js');

// GET: ambil URL PDF Data Investasi yang lagi aktif — dipanggil sama DataInvestasiPage.js
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db; // sesuaikan sama koneksi DB existing lo
        const [rows] = await db.query(
            'SELECT pdf_url FROM data_investasi ORDER BY updated_at DESC LIMIT 1'
        );
        res.json({ pdfUrl: rows[0]?.pdf_url || null });
    } catch (err) {
        console.error('Gagal ambil data investasi:', err);
        res.status(500).json({ error: 'Gagal ambil data investasi' });
    }
});

// POST: admin upload PDF baru
router.post('/upload', /* requireAdmin, */ upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File PDF wajib diisi' });
        }
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: 'File harus berformat PDF' });
        }

        const blob = await put(
            `data-investasi/${Date.now()}-${req.file.originalname}`,
            req.file.buffer,
            { access: 'public', contentType: 'application/pdf' }
        );

        const db = req.app.locals.db;
        await db.query(
            'INSERT INTO data_investasi (pdf_url, updated_at) VALUES (?, NOW())',
            [blob.url]
        );

        res.json({ success: true, pdfUrl: blob.url });
    } catch (err) {
        console.error('Gagal upload PDF:', err);
        res.status(500).json({ error: 'Gagal upload PDF' });
    }
});

module.exports = router;

// Di server.js / app.js, daftarin route ini:
// app.use('/api/data-investasi', require('./routes/dataInvestasi.route'));