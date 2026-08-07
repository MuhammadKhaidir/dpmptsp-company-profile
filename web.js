// web.js
// Semua route API didaftarkan di sini, di-mount oleh server.js di bawah prefix /api.
//
// PENTING soal keamanan API key:
// Browser (public/js/AiChat.js) CUMA kirim { messages: [...] } ke endpoint /api/chat di server ini.
// Server yang nyimpen OPENROUTER_API_KEY (dari file .env) & manggil OpenRouter dari sini.
// Key TIDAK PERNAH dikirim ke browser, jadi gak akan pernah muncul di DevTools Network tab
// punya user — yang keliatan di sana cuma request ke domain sendiri.

const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/auth');
router.use('/auth', authRoutes); // -> /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/check-session

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

// BARU: fitur pengaduan/laporan dan dashboard masyarakat/petugas/admin yang
// menyertainya SUDAH TIDAK ADA lagi di situs ini -- tabel database terkait
// sudah tidak dipakai satupun route. Makanya prompt ini TIDAK LAGI mengajari
// AI soal DASHBOARD_MASYARAKAT / DASHBOARD_PETUGAS / DASHBOARD_ADMIN /
// FORM_LAPORAN -- itu semua dulu memicu tampilan yang sekarang jadi jalan
// buntu. Satu-satunya alasan orang perlu LOGIN sekarang adalah kalau dia
// admin yang mau mengelola tampilan situs (ganti gambar QR/latar/dokumen
// terkait, isi carousel, flip book, peta, musik) -- begitu admin login,
// tombol edit muncul LANGSUNG di halaman terkait, TIDAK ADA dashboard
// terpisah untuk itu.
const AI_SYSTEM_PROMPT = `Kamu adalah Asisten AI DPMPTSP (Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu) Kota Palembang.
Tugasmu membantu masyarakat menjelajahi situs ini: profil & visi-misi, katalog investasi lewat kode QR, company profile (flip book), peta investasi, dan musik latar.

Kamu bisa mengarahkan pengguna ke halaman berikut dengan mendeteksi niat mereka:
- LOGIN → jika user ingin masuk/login ke sistem. Ini TERMASUK kalau dia admin yang ingin mengelola tampilan situs (ganti gambar kode QR, gambar latar, dokumen terkait, isi carousel, flip book, peta, atau musik) -- setelah admin login, tombol "Perbarui Tampilan" otomatis muncul langsung di bagian yang bersangkutan, TIDAK ADA dashboard terpisah untuk itu.
- REGISTER → jika user ingin daftar/registrasi akun baru

Jika kamu mendeteksi user ingin ke salah satu halaman di atas, tambahkan tag navigasi di AKHIR pesan (setelah chips):
[NAV: LOGIN] atau [NAV: REGISTER]

PENTING: Situs ini TIDAK memiliki fitur pengaduan/laporan, dan TIDAK ADA dashboard terpisah untuk masyarakat/petugas/admin. Jangan pernah menawarkan atau menyebut "buat laporan pengaduan", "verifikasi laporan", atau "dashboard admin/petugas/masyarakat" -- fitur-fitur itu sudah tidak ada di situs ini. Kalau user menanyakan hal itu, jelaskan dengan sopan bahwa situs ini sekarang berfokus pada informasi investasi (kode QR, katalog, company profile, peta investasi), dan kalau dia admin yang ingin mengelola tampilan situs, arahkan dia untuk login saja.

Selalu jawab dalam Bahasa Indonesia yang ramah dan profesional.
Jawaban singkat dan jelas (maksimal 2-3 kalimat).

Setelah setiap balasan, sertakan 2-4 pilihan tindakan relevan dalam format JSON:
[CHIPS: ["Pilihan 1", "Pilihan 2", "Pilihan 3"]]

Contoh chips berdasarkan konteks:
- Awal: ["Masuk ke Sistem", "Daftar Akun Baru", "Scan Kode QR", "Lihat Company Profile"]
- Setelah tanya soal kode QR/katalog: ["Scan Kode QR", "Buka Buku Katalog Investasi"]
- Setelah tanya soal login admin: ["Masuk ke Sistem"]
- Setelah navigasi: ["Kembali ke Beranda", "Tanya Hal Lain"]`;

router.post('/chat', async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY belum diset di server (.env)' });
    }
    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages harus berupa array' });
    }

    const response = await fetch(OR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'DPMPTSP Asisten'
      },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...messages],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[web.js] OpenRouter error:', data);
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    res.json({ reply: data.choices?.[0]?.message?.content ?? '' });
  } catch (err) {
    console.error('[web.js] /chat error:', err);
    res.status(500).json({ error: 'Gagal menghubungi AI' });
  }
});

module.exports = router;