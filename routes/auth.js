// routes/auth.js
// Semua route auth, di-mount di web.js sebagai /api/auth/*

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { nama_lengkap, nik, no_hp, email, password } = req.body;

    if (!nama_lengkap || !nik || !no_hp || !email || !password) {
      return res.json({ success: false, message: 'Semua kolom wajib diisi' });
    }
    if (!/^\d{16}$/.test(nik)) {
      return res.json({ success: false, message: 'NIK harus 16 digit angka' });
    }
    if (password.length < 8) {
      return res.json({ success: false, message: 'Kata sandi minimal 8 karakter' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR nik = ?',
      [email, nik]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: 'Email atau NIK sudah terdaftar' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (nik, nama_lengkap, email, no_hp, password, role)
       VALUES (?, ?, ?, ?, ?, 'masyarakat')`,
      [nik, nama_lengkap, email, no_hp, hash]
    );

    res.json({ success: true, message: 'Registrasi berhasil, silakan login' });
  } catch (err) {
    console.error('[auth.js] /register error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
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