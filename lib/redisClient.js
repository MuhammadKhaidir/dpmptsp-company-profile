// lib/redisClient.js
//
// Client Redis (Upstash) yang dipakai bersama oleh beberapa modul (qrImageStore,
// rate-limit lockout di routes/qrImages.js, dst).
//
// PENTING: client-nya dibikin LAZY (baru dibuat pas beneran dipanggil lewat
// getRedis(), bukan langsung pas file ini di-require). Kenapa ini krusial di
// Vercel: Node me-require semua file secara SINKRON pas cold start, sebelum
// request apapun diproses. Kalau kode di top-level sebuah file throw (misal
// karena env var belum ke-set), SELURUH server ikut gagal dimuat -- bukan
// cuma route yang butuh Redis, tapi literally semua route, termasuk
// halaman utama. Itu tepatnya yang bikin seluruh situs sempat down kemarin.
// Dengan versi lazy ini, error karena env var/kredensial yang belum beres
// baru muncul pas request YANG BENERAN BUTUH Redis dijalankan -- dan itu
// pun ketangkep try/catch di route handler-nya, jadi cuma bikin request
// itu 500, bukan bikin seluruh function crash.
//
// Env vars yang WAJIB ada (otomatis ke-set kalau kamu connect integrasi
// "Upstash Redis" lewat tab Storage/Marketplace di dashboard Vercel):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Kalau nama env var di project kamu ternyata beda (misal dikasih prefix
// custom pas connect integrasinya), cek tab Environment Variables di
// dashboard Vercel dan sesuaikan bagian getRedis() di bawah.

const { Redis } = require('@upstash/redis');

let _redis = null;

function getRedis() {
    if (_redis) return _redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        throw new Error(
            'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum ditemukan di Environment Variables. ' +
            'Pastikan integrasi Upstash Redis sudah di-connect di dashboard Vercel (tab Storage/Marketplace) ' +
            'dan project sudah di-redeploy setelah itu.'
        );
    }

    _redis = new Redis({ url, token });
    return _redis;
}

// Upstash SDK kadang udah auto-deserialize object, kadang masih string
// (tergantung cara nyimpennya) -- getJSON/setJSON di bawah nyeragamin biar
// pemakaiannya predictable di semua tempat.
async function getJSON(key) {
    const raw = await getRedis().get(key);
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
    return getRedis().set(key, JSON.stringify(value), opts);
}

async function delKey(key) {
    return getRedis().del(key);
}

module.exports = { getJSON, setJSON, delKey };