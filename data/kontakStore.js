// data/kontakStore.js
//
// Info kontak (Alamat, Telepon, Email, Jam Pelayanan) yang ditampilkan di
// KontakPage.js -- SEKARANG BISA DIEDIT ADMIN. Dulu isinya di-hardcode
// langsung di public/js/KontakPage.js (array KONTAK_INFO_ITEMS), jadi tiap
// kali alamat/nomor telepon/jam pelayanan berubah, harus edit kode &
// deploy ulang. Sekarang disimpan sebagai satu key JSON di Upstash Redis,
// pola sama kayak data/flipbookStore.js & data/dataInvestasiStore.js --
// bedanya di sini gak ada berkas yang diunggah, jadi gak perlu Vercel Blob.

const { getJSON, setJSON } = require('../lib/redisClient');

const KONTAK_KEY = 'kontak:info';

// Nilai default/awal -- dipakai kalau di Redis belum ada apa-apa sama
// sekali (pertama kali fitur ini di-deploy). Isinya SAMA PERSIS kayak
// KONTAK_INFO_ITEMS yang tadinya di-hardcode.
const DEFAULT_ITEMS = [
    {
        id: 'alamat',
        icon: 'pin',
        title: 'Alamat',
        lines: ['Jl. Merdeka No. 123, Ilir Timur I', 'Palembang, Sumatera Selatan 30111']
    },
    {
        id: 'telepon',
        icon: 'phone',
        title: 'Telepon',
        lines: ['(0711) 123456']
    },
    {
        id: 'email',
        icon: 'mail',
        title: 'Email',
        lines: ['dpmptsp@palembang.go.id']
    },
    {
        id: 'jam',
        icon: 'clock',
        title: 'Jam Pelayanan',
        lines: ['Senin – Jumat  |  08.00 – 16.00 WIB']
    }
];

async function getItems() {
    const items = await getJSON(KONTAK_KEY);
    if (items && Array.isArray(items) && items.length) return items;

    // Belum ada data sama sekali di Redis -- simpan dulu nilai default-nya
    // biar request berikutnya konsisten & langsung bisa diedit admin.
    await setJSON(KONTAK_KEY, DEFAULT_ITEMS);
    return DEFAULT_ITEMS;
}

function findItem(items, id) {
    const item = items.find((it) => it.id === id);
    if (!item) {
        const err = new Error('Info kontak tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }
    return item;
}

// Ganti ISI (lines) satu item kontak. Judul & ikon (title/icon) sengaja
// TIDAK bisa diganti lewat sini -- kategorinya tetap 4 (Alamat/Telepon/
// Email/Jam Pelayanan), cuma isi teksnya yang bisa diperbarui admin.
async function updateItemLines(id, lines) {
    const items = await getItems();
    const item = findItem(items, id);

    const cleanLines = (Array.isArray(lines) ? lines : [])
        .map((line) => (line || '').trim())
        .filter(Boolean);

    if (!cleanLines.length) {
        const err = new Error('Isi tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
    }

    item.lines = cleanLines.slice(0, 6); // batas wajar, cegah isi kepanjangan nyangkut selamanya
    await setJSON(KONTAK_KEY, items);
    return items;
}

module.exports = {
    getItems,
    updateItemLines
};
