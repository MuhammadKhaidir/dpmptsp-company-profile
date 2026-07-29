// routes/music.js
//
// Router Express untuk fitur pemutar musik latar. Mendukung hingga 3 slot
// lagu (slot1, slot2, slot3). Endpoint:
//   GET    /api/music/list         -> daftar lagu yang tersedia (publik,
//                                      tidak perlu kata sandi -- hanya untuk
//                                      melihat & memutar)
//   GET    /api/music/file/:slot   -> streaming berkas audio (mendukung
//                                      Range header untuk seek/scrubbing)
//   POST   /api/music/:slot        -> unggah/ganti lagu (WAJIB kata sandi)
//   DELETE /api/music/:slot        -> hapus lagu dari slot (WAJIB kata sandi)
//
// CARA PASANG ke server.js (2 baris, taruh dekat route qr-images):
//   const musicRouter = require('./routes/music');
//   app.use('/api/music', musicRouter);
//
// WAJIB: multer (kalau sebelumnya sudah diinstal untuk fitur ganti gambar
// QR, tidak perlu instal ulang -- npm install multer).
//
// KATA SANDI: fitur ini SENGAJA memakai variabel .env yang SAMA dengan
// fitur ganti gambar QR (QR_EDIT_PASSWORD), supaya hanya ada satu kata
// sandi pengelolaan konten yang perlu diingat. Kalau ke depannya ingin
// kata sandi terpisah, tinggal ganti baris process.env.QR_EDIT_PASSWORD
// di bawah menjadi variabel .env baru, misalnya MUSIC_EDIT_PASSWORD.
//
// CATATAN PATH: baris require di bawah mengasumsikan folder data/ berada
// di root proyek (sejajar dengan routes/, server.js), sama seperti
// routes/qrImages.js. Kalau folder data/ ada di dalam public/data/, ganti
// baris require menjadi: require('../public/data/musicStore')
//
// PENTING: endpoint DELETE di bawah membaca req.body sebagai JSON --
// mengasumsikan express.json() sudah dipasang secara global di server.js
// (seperti yang sudah dipakai oleh /api/chat & /api/auth).

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const store = require('../data/musicStore');

const router = express.Router();

const ALLOWED_MIME = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'
]);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB -- ubah di sini kalau perlu ukuran berbeda
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

/* ------------------------------------------------------------------ */
/* Proteksi kata sandi + penjagaan dasar terhadap percobaan brute-force */
/* (pola identik dengan routes/qrImages.js)                            */
/* ------------------------------------------------------------------ */

const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function getClientIp(req) {
    return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function checkLockout(req, res) {
    const ip = getClientIp(req);
    const rec = failedAttempts.get(ip);
    if (rec && rec.lockedUntil && Date.now() < rec.lockedUntil) {
        const waitSec = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
        res.status(429).json({
            success: false,
            message: `Terlalu banyak percobaan yang gagal. Silakan coba kembali dalam ${waitSec} detik.`
        });
        return false;
    }
    return true;
}

function registerFailedAttempt(req) {
    const ip = getClientIp(req);
    const rec = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCKOUT_MS;
        rec.count = 0;
    }
    failedAttempts.set(ip, rec);
}

function clearFailedAttempts(req) {
    failedAttempts.delete(getClientIp(req));
}

function verifyPassword(inputPassword) {
    const real = process.env.QR_EDIT_PASSWORD;
    if (!real) return { ok: false, reason: 'not-configured' };
    if (!inputPassword) return { ok: false, reason: 'wrong' };

    const a = Buffer.from(String(inputPassword));
    const b = Buffer.from(String(real));
    if (a.length !== b.length) return { ok: false, reason: 'wrong' };
    const match = crypto.timingSafeEqual(a, b);
    return { ok: match, reason: match ? null : 'wrong' };
}

/* ------------------------------------------------------------------ */
/* GET /api/music/list                                                 */
/* ------------------------------------------------------------------ */
router.get('/list', (req, res) => {
    res.json({ success: true, tracks: store.getPublicList() });
});

/* ------------------------------------------------------------------ */
/* GET /api/music/file/:slot  (mendukung Range header untuk seek)      */
/* ------------------------------------------------------------------ */
router.get('/file/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    const entry = store.getSlotTrack(slot);
    if (!entry) {
        return res.status(404).json({ success: false, message: 'Slot ini belum memiliki lagu.' });
    }
    const filePath = path.join(store.UPLOAD_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Berkas lagu tidak ditemukan pada server.' });
    }

    const mimeType = entry.mimeType || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match && match[1] ? parseInt(match[1], 10) : 0;
        const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;

        if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
        }

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': mimeType,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

/* ------------------------------------------------------------------ */
/* POST /api/music/:slot  (multipart: password, title, audio)          */
/* ------------------------------------------------------------------ */
router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    if (!checkLockout(req, res)) return;

    upload.single('audio')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Proses pengunggahan gagal.' });
        }

        const { password, title } = req.body;
        const verdict = verifyPassword(password);

        if (!verdict.ok) {
            registerFailedAttempt(req);
            if (verdict.reason === 'not-configured') {
                return res.status(500).json({
                    success: false,
                    message: 'Fitur pengelolaan musik belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada berkas .env server terlebih dahulu.'
                });
            }
            return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
        }

        clearFailedAttempts(req);

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada berkas lagu yang dikirim.' });
        }

        const cleanTitle = String(title || '').trim().slice(0, MAX_TITLE_LENGTH) ||
            req.file.originalname.replace(/\.[^/.]+$/, '');

        const ext = (req.file.mimetype.split('/')[1] || 'mp3')
            .replace('mpeg', 'mp3')
            .replace('x-m4a', 'm4a')
            .replace('x-wav', 'wav');
        const filename = `${slot}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const destPath = path.join(store.UPLOAD_DIR, filename);

        fs.writeFile(destPath, req.file.buffer, (writeErr) => {
            if (writeErr) {
                console.error('[music] Gagal menyimpan berkas:', writeErr);
                return res.status(500).json({ success: false, message: 'Gagal menyimpan berkas pada server.' });
            }

            const entry = store.setSlotTrack(slot, {
                filename,
                mimeType: req.file.mimetype,
                title: cleanTitle,
                updatedAt: Date.now()
            });

            res.json({ success: true, message: 'Lagu berhasil disimpan.', entry });
        });
    });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/music/:slot  (JSON body: { password })                  */
/* ------------------------------------------------------------------ */
router.delete('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    if (!checkLockout(req, res)) return;

    const password = req.body && req.body.password;
    const verdict = verifyPassword(password);

    if (!verdict.ok) {
        registerFailedAttempt(req);
        if (verdict.reason === 'not-configured') {
            return res.status(500).json({
                success: false,
                message: 'Fitur pengelolaan musik belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada berkas .env server terlebih dahulu.'
            });
        }
        return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
    }

    clearFailedAttempts(req);
    store.clearSlotTrack(slot);
    res.json({ success: true, message: 'Lagu berhasil dihapus.' });
});

module.exports = router;