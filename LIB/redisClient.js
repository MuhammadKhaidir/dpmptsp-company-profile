// lib/redisClient.js
//
// Client Redis (Upstash) yang dipakai bersama oleh beberapa modul (qrImageStore,
// rate-limit lockout di routes/qrImages.js, dst). Sengaja dipisah ke sini biar
// gak bikin instance Redis baru di tiap file yang butuh.
//
// Env vars yang WAJIB ada (otomatis ke-set kalau kamu connect integrasi
// "Upstash Redis" lewat tab Storage/Marketplace di dashboard Vercel):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Kalau nama env var di project kamu ternyata beda (misal dikasih prefix
// custom pas connect integrasinya), cek tab Environment Variables di
// dashboard Vercel dan sesuaikan Redis.fromEnv() di bawah jadi:
//   new Redis({ url: process.env.NAMA_URL_KAMU, token: process.env.NAMA_TOKEN_KAMU })

const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();

// Upstash SDK kadang udah auto-deserialize object, kadang masih string
// (tergantung cara nyimpennya) -- getJSON/setJSON di bawah nyeragamin biar
// pemakaiannya predictable di semua tempat.
async function getJSON(key) {
    const raw = await redis.get(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (err) {
            return null;
        }
    }
    return raw;
}

async function setJSON(key, value, opts) {
    return redis.set(key, JSON.stringify(value), opts);
}

module.exports = { redis, getJSON, setJSON };