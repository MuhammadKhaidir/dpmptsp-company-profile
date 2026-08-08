// lib/redisSessionStore.js
//
// Custom express-session Store berbasis Upstash Redis, numpang di
// lib/redisClient.js yang udah ada & udah kebukti jalan (dipakai juga
// sama data/arcCarouselStore.js dkk).
//
// KENAPA GAK PAKAI connect-redis: connect-redis (baik versi lama yang
// callback-based buat ioredis, maupun versi 7 yang promise-based buat
// node-redis v4) dirancang buat client Redis TCP biasa, BUKAN buat
// client REST kayak @upstash/redis. Nama method-nya keliatan mirip
// (get/set/del/expire), tapi signature & perilaku detailnya (terutama
// expiry & null-handling) gak dijamin klop kalau dipasangin paksa --
// dan kalau meleset, GAGALNYA SENYAP (sesi keliatan jalan pas testing
// manual tapi bocor/gak konsisten pas production), bukan error yang
// jelas kelihatan. Daripada nebak-nebak kompatibilitas, lebih aman
// nulis store sendiri yang cuma manggil getJSON/setJSON/delKey yang
// udah terbukti jalan.
//
// Class ini extend session.Store bawaan express-session -- express-
// session sendiri yang manggil get/set/destroy/touch di titik yang
// tepat (termasuk konversi otomatis cookie.expires dari string balik
// ke Date object lewat Store.prototype.createSession bawaan), kita
// cuma perlu isi 4 method di bawah, gak perlu urus detail itu manual.

const session = require('express-session');
const { getJSON, setJSON, delKey } = require('./redisClient');

const PREFIX = 'sess:';

class UpstashSessionStore extends session.Store {
    // ttlSeconds: dipakai buat expiry key di Redis. SAMA PERSIS sama
    // cookie.maxAge di server.js (2 jam) -- kalau dua-duanya beda,
    // salah satu bisa "kelihatan aktif" di sisi lain padahal udah
    // gak sinkron.
    constructor(options) {
        super();
        this.ttlSeconds = (options && options.ttlSeconds) || 60 * 60 * 2; // 2 jam
    }

    get(sid, callback) {
        getJSON(PREFIX + sid)
            .then((data) => callback(null, data || null))
            .catch((err) => callback(err));
    }

    set(sid, sessionData, callback) {
        setJSON(PREFIX + sid, sessionData, { ex: this.ttlSeconds })
            .then(() => callback(null))
            .catch((err) => callback(err));
    }

    destroy(sid, callback) {
        delKey(PREFIX + sid)
            .then(() => callback(null))
            .catch((err) => callback(err));
    }

    // touch: dipanggil express-session tiap ada request ke sesi yang
    // udah ada (resave:false bikin ini yang jaga TTL "geser maju"
    // selama user aktif, bukan bikin ulang sesi dari nol). Cukup tulis
    // ulang data yang sama -- expiry-nya ikut ke-refresh otomatis
    // lewat opsi `ex` di set().
    touch(sid, sessionData, callback) {
        this.set(sid, sessionData, callback);
    }
}

module.exports = UpstashSessionStore;