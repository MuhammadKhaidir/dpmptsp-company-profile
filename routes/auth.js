// routes/auth.js
// Semua route auth, di-mount di web.js sebagai /api/auth/*
//
// BARU: situs ini sekarang login KHUSUS ADMIN. Pendaftaran akun publik
// (masyarakat/petugas) sudah dicabut -- itu peninggalan fitur pengaduan
// yang sudah tidak dipakai lagi (lihat AI_SYSTEM_PROMPT di web.js dan
// middleware/requireAdmin.js). Endpoint /register TETAP di-mount (bukan
// dihapus total) supaya kalau masih ada form registrasi lama yang belum
// sempat dibongkar di frontend, dia dapat pesan jelas -- bukan error
// jaringan mentah (404) yang membingungkan.
//
// Akun masyarakat/petugas LAMA yang masih ada di tabel `users` (dari
// sebelum fitur ini dicabut) TETAP BISA cocok kredensialnya (email/NIK &
// kata sandi benar), tapi ditolak di /login karena role-nya bukan 'admin'
// -- lihat pengecekan di bawah.

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// POST /api/auth/register -- dinonaktifkan, lihat catatan di atas.
router.post('/register', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Pendaftaran akun publik sudah tidak tersedia. Sistem ini kini khusus untuk admin.'
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ success: false, message: 'Email/NIK dan kata sandi wajib diisi' });
    }

    // Login bisa pakai email ATAU NIK (sesuai label form "Email / NIK")
    const [rows] = await pool.query(
      'SELECT id, nama_lengkap, password, role FROM users WHERE email = ? OR nik = ? LIMIT 1',
      [email, email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: 'Email/NIK atau kata sandi salah' });
    }

    // BARU: tolak akun non-admin walau kredensialnya benar -- sisa akun
    // masyarakat/petugas dari fitur pengaduan lama gak lagi bisa masuk.
    if (user.role !== 'admin') {
      return res.json({ success: false, message: 'Akun ini tidak memiliki akses. Sistem ini kini khusus untuk admin.' });
    }

    req.session.user_id = user.id;
    req.session.nama_lengkap = user.nama_lengkap;
    req.session.role = user.role;

    res.json({ success: true, role: user.role, nama_lengkap: user.nama_lengkap });
  } catch (err) {
    console.error('[auth.js] /login error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/check-session (buat auto-redirect kalau halaman di-refresh)
router.get('/check-session', (req, res) => {
  if (req.session.user_id) {
    res.json({
      logged_in: true,
      role: req.session.role,
      nama_lengkap: req.session.nama_lengkap
    });
  } else {
    res.json({ logged_in: false });
  }
});

module.exports = router;