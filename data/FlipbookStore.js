// data/flipbookStore.js
//
// Penyimpanan KONTEN BUKU flipbook (judul, sampul, halaman isi termasuk
// gambarnya) untuk lingkungan SERVERLESS (Vercel). Mengikuti pola yang
// SAMA PERSIS dengan data/qrBgStore.js:
// - Berkas gambar per halaman -> Vercel Blob (object storage).
// - Struktur buku (judul, teks, urutan halaman, url gambar) -> Upstash
//   Redis, disimpan sebagai SATU JSON UTUH per buku (bukan per-field),
//   supaya nambah/hapus/urutan-ulang halaman gampang -- tinggal timpa
//   seluruh array `content` sekali jalan.
//
// PENTING: store ini cuma nyimpen OVERRIDE hasil edit lewat panel admin.
// Kalau satu buku belum pernah diedit, getBook() balikin null, dan
// frontend (flipbook-scroll.js) otomatis pakai DEFAULT_BOOKS bawaan
// kode buat slot itu (lihat fetchBookOverrides()+mergeBooks() di sana).
// Jadi kalau Redis lagi bermasalah, situs tetap tampil normal pakai
// konten default, bukan kosong/error.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

// Jumlah buku DITETAPKAN mengikuti DEFAULT_BOOKS di flipbook-scroll.js
// (saat ini 3). Panel admin cuma bisa EDIT ISI buku yang sudah ada,
// belum bisa nambah buku baru -- kalau nanti mau diperluas ke jumlah
// buku dinamis, ini titik yang perlu diubah bareng frontend-nya.
const BOOK_COUNT = 3;

function isValidBookIndex(index) {
    const i = Number(index);
    return Number.isInteger(i) && i >= 0 && i < BOOK_COUNT;
}

function keyFor(index) {
    return `flipbook:book:${index}`;
}

async function getBook(index) {
    if (!isValidBookIndex(index)) return null;
    return getJSON(keyFor(index));
}

async function getAllBooks() {
    const books = [];
    for (let i = 0; i < BOOK_COUNT; i++) {
        books.push(await getBook(i));
    }
    return books;
}

// Kumpulin semua pathname blob gambar yang ada di satu object buku, buat
// dibandingin sebelum/sesudah save -- biar blob lama yang gak kepake lagi
// (halaman dihapus, atau gambarnya diganti) bisa dihapus, dan yang masih
// kepake gak ikut kehapus.
function collectBlobPathnames(book) {
    const set = new Set();
    if (!book || !Array.isArray(book.content)) return set;
    book.content.forEach((page) => {
        if (page && page.image && page.image.pathname) {
            set.add(page.image.pathname);
        }
    });
    return set;
}

// bookData: object buku BARU (title, cover, backCover, content[]) hasil
// parse JSON dari form admin. Setiap content[i].image yang gambarnya
// baru diupload HARUS SUDAH diisi { url, pathname } oleh caller
// (routes/flipbook.js) SEBELUM manggil fungsi ini -- fungsi ini cuma
// nyimpen datanya & beresin blob lama yang gak dipakai lagi.
async function saveBook(index, bookData) {
    if (!isValidBookIndex(index)) throw new Error('Index buku tidak valid: ' + index);

    const prev = await getBook(index);
    const prevPathnames = collectBlobPathnames(prev);
    const nextPathnames = collectBlobPathnames(bookData);

    await setJSON(keyFor(index), bookData);

    // Hapus blob gambar lama yang sudah TIDAK dipakai lagi di data baru,
    // dilakukan SETELAH data baru berhasil tersimpan -- biar kalau ada
    // yang gagal di tengah jalan, gambar lama gak ilang percuma.
    prevPathnames.forEach((pathname) => {
        if (!nextPathnames.has(pathname)) {
            del(pathname).catch((err) => {
                console.error('[flipbookStore] Gagal hapus blob lama:', err);
            });
        }
    });

    return bookData;
}

// Upload satu berkas gambar halaman ke Blob, balikin { url, pathname }.
async function uploadPageImage(bookIndex, pageSlot, { buffer, mimeType, ext }) {
    const blob = await put(
        `flipbook/book${bookIndex}-${pageSlot}-${Date.now()}.${ext}`,
        buffer,
        { access: 'public', contentType: mimeType, addRandomSuffix: true }
    );
    return { url: blob.url, pathname: blob.pathname };
}

module.exports = {
    BOOK_COUNT,
    isValidBookIndex,
    getBook,
    getAllBooks,
    saveBook,
    uploadPageImage
};