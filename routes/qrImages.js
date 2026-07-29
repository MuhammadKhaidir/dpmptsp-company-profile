const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const store = require('../data/qrImageStore');

const router = express.Router();

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB -- ubah di sini kalau perlu ukuran berbeda
const MAX_TITLE_LENGTH = 80; // ubah di sini kalau perlu batas karakter judul berbeda

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

const failedAttempts = new Map(); // ip -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 menit

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

// ------------------------------------------------------------------
// Penyimpanan judul kotak QR (mis. "Katalog Investasi").
// Disimpan terpisah dari qrImageStore (yang cuma ngurus gambar) lewat
// satu berkas JSON kecil di dalam folder upload yang sama, supaya
// gak perlu ubah-ubah qrImageStore.js. Formatnya: { left: "...",
// center: "...", right: "..." }.
// ------------------------------------------------------------------
const TITLES_FILE = path.join(store.UPLOAD_DIR, '_titles.json');

function loadTitles() {
    try {
        const raw = fs.readFileSync(TITLES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
        return {};
    }
}

function saveTitles(titles) {
    fs.writeFileSync(TITLES_FILE, JSON.stringify(titles, null, 2), 'utf8');
}

function getSlotTitle(slot) {
    const titles = loadTitles();
    return titles[slot] || null;
}

function setSlotTitle(slot, title) {
    const titles = loadTitles();
    titles[slot] = title;
    saveTitles(titles);
    return titles[slot];
}

router.get('/meta', (req, res) => {
    const meta = store.getMeta();
    const titles = loadTitles();
    const mergedMeta = {};
    Object.keys(meta).forEach((slot) => {
        mergedMeta[slot] = Object.assign({}, meta[slot], { title: titles[slot] || null });
    });
    res.json({ success: true, meta: mergedMeta });
});

router.get('/file/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }
    const entry = store.getSlotImage(slot);
    if (!entry) {
        return res.status(404).json({ success: false, message: 'Belum terdapat gambar khusus untuk slot ini.' });
    }
    const filePath = path.join(store.UPLOAD_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Berkas gambar tidak ditemukan pada server.' });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
    res.sendFile(filePath);
});

router.post('/:slot', (req, res) => {
    const { slot } = req.params;
    if (!store.isValidSlot(slot)) {
        return res.status(404).json({ success: false, message: 'Slot tidak dikenali.' });
    }

    if (!checkLockout(req, res)) return;

    upload.single('image')(req, res, (err) => {
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
                    message: 'Fitur pembaruan gambar belum dikonfigurasi. Silakan atur QR_EDIT_PASSWORD pada berkas .env server terlebih dahulu.'
                });
            }
            return res.status(401).json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' });
        }

        clearFailedAttempts(req);

        const trimmedTitle = typeof title === 'string' ? title.trim() : '';

        if (trimmedTitle.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Judul terlalu panjang (maksimal ${MAX_TITLE_LENGTH} karakter).`
            });
        }

        if (!req.file && !trimmedTitle) {
            return res.status(400).json({ success: false, message: 'Tidak ada berkas gambar atau judul baru yang dikirim.' });
        }

        function respondWith(imageEntry) {
            let titleEntry = getSlotTitle(slot);
            if (trimmedTitle) {
                titleEntry = setSlotTitle(slot, trimmedTitle);
            }
            const baseEntry = imageEntry || store.getSlotImage(slot) || {};
            res.json({
                success: true,
                message: 'Perubahan berhasil disimpan.',
                entry: Object.assign({}, baseEntry, { title: titleEntry })
            });
        }

        if (!req.file) {
            // Cuma judul yang diganti, gambar tetap yang lama.
            respondWith(null);
            return;
        }

        const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
        const filename = `${slot}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const destPath = path.join(store.UPLOAD_DIR, filename);

        fs.writeFile(destPath, req.file.buffer, (writeErr) => {
            if (writeErr) {
                console.error('[qrImages] Gagal menyimpan berkas:', writeErr);
                return res.status(500).json({ success: false, message: 'Gagal menyimpan berkas pada server.' });
            }

            const entry = store.setSlotImage(slot, {
                filename,
                mimeType: req.file.mimetype,
                updatedAt: Date.now()
            });

            respondWith(entry);
        });
    });
});

module.exports = router;