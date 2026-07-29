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

const AI_SYSTEM_PROMPT = `Kamu adalah Asisten AI DPMPTSP (Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu) Kota Palembang.
Tugasmu membantu masyarakat dan petugas untuk navigasi dan penggunaan sistem.

Kamu bisa mengarahkan pengguna ke halaman-halaman berikut dengan mendeteksi niat mereka:
- LOGIN → jika user ingin masuk/login ke sistem
- REGISTER → jika user ingin daftar/registrasi akun baru
- DASHBOARD_MASYARAKAT → jika user ingin melihat dashboard masyarakat / pengaduan mereka
- DASHBOARD_PETUGAS → jika user adalah petugas/staf yang ingin verifikasi laporan
- DASHBOARD_ADMIN → jika user adalah admin yang ingin melihat analitik/statistik
- FORM_LAPORAN → jika user ingin membuat/mengajukan laporan pengaduan baru

Jika kamu mendeteksi bahwa user ingin ke salah satu halaman di atas, tambahkan tag navigasi di AKHIR pesan (setelah chips):
[NAV: LOGIN] atau [NAV: REGISTER] atau [NAV: DASHBOARD_MASYARAKAT] atau [NAV: DASHBOARD_PETUGAS] atau [NAV: DASHBOARD_ADMIN] atau [NAV: FORM_LAPORAN]

Selalu jawab dalam Bahasa Indonesia yang ramah dan profesional.
Jawaban singkat dan jelas (maksimal 2-3 kalimat).

Setelah setiap balasan, sertakan 2-4 pilihan tindakan relevan dalam format JSON:
[CHIPS: ["Pilihan 1", "Pilihan 2", "Pilihan 3"]]

Contoh chips berdasarkan konteks:
- Awal: ["Masuk ke Sistem", "Daftar Akun Baru", "Buat Laporan", "Lihat Dashboard"]
- Setelah tanya laporan: ["Buka Form Laporan", "Login Dulu", "Daftar Akun"]
- Setelah tanya status: ["Login sebagai Masyarakat", "Daftar Akun Baru"]
- Untuk petugas: ["Login sebagai Petugas", "Verifikasi Laporan"]
- Untuk admin: ["Masuk sebagai Admin", "Lihat Analitik"]
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