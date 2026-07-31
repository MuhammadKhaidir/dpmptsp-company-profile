// data/flipbookStore.js
//
// Penyimpanan KONTEN FlipBook (judul & tulisan tiap halaman, plus gambar
// opsional per halaman) untuk lingkungan SERVERLESS (Vercel). Mengikuti
// pola yang SAMA PERSIS dengan data/qrBgStore.js:
// - Berkas gambar per halaman -> Vercel Blob (object storage).
// - Data buku (judul, tulisan tiap halaman, dll) -> Upstash Redis.
//
// Beda dari qrBgStore.js: qrBgStore nyimpen per-slot (3 key terpisah)
// karena strukturnya flat. Di sini datanya nested (buku -> daftar
// halaman -> tiap halaman punya beberapa field), jadi lebih simpel &
// murah kalau seluruh array buku disimpan sebagai SATU key JSON di
// Redis, bukan dipecah per halaman.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

const BOOKS_KEY = 'flipbook:books';

// Data bawaan -- SAMA PERSIS dengan DEFAULT_BOOKS yang tadinya di
// js/FlipBookScroll.js. Dipakai sebagai isian awal kalau di Redis belum
// ada apa-apa sama sekali (misal baru pertama kali deploy fitur ini).
const DEFAULT_BOOKS = [
    {
        id: 'book-1',
        title: 'Sejarah & Latar Belakang',
        cover: {
            kicker: 'DPMPTSP KOTA PALEMBANG',
            heading: 'Sejarah & Latar Belakang'
        },
        content: [
            { page: '01', heading: 'Awal Pembentukan', body: 'DPMPTSP Kota Palembang dibentuk sebagai jawaban atas kebutuhan pelayanan perizinan yang lebih cepat, transparan, dan terintegrasi dalam satu atap.' },
            { page: '02', heading: 'Perluasan Layanan', body: 'Cakupan layanan terus diperluas, mulai dari izin usaha dan izin lokasi hingga rekomendasi teknis lintas sektor, agar masyarakat tak perlu berpindah-pindah instansi.' },
            { page: '03', heading: 'Menuju Digitalisasi', body: 'Transformasi digital jadi arah utama, dengan sistem pengaduan dan pemantauan perizinan yang bisa diakses langsung secara online oleh masyarakat.' }
        ],
        backCover: { heading: 'DPMPTSP', tagline: 'Kota Palembang' }
    },
    {
        id: 'book-2',
        title: 'Visi & Misi',
        cover: {
            kicker: 'DPMPTSP KOTA PALEMBANG',
            heading: 'Visi & Misi'
        },
        content: [
            { page: '01', heading: 'Visi', body: 'Mewujudkan pelayanan perizinan dan penanaman modal yang cepat, transparan, dan berorientasi pada kepuasan masyarakat.' },
            { page: '02', heading: 'Misi Pelayanan', body: 'Meningkatkan kualitas pelayanan publik lewat proses yang sederhana, terukur, dan dapat dipertanggungjawabkan kepada masyarakat.' },
            { page: '03', heading: 'Misi Digital', body: 'Mempercepat proses perizinan berbasis digital serta membuka ruang partisipasi dan pengaduan masyarakat seluas-luasnya.' }
        ],
        backCover: { heading: 'Visi & Misi', tagline: 'DPMPTSP Kota Palembang' }
    },
    {
        id: 'book-3',
        title: 'Struktur & Layanan',
        cover: {
            kicker: 'DPMPTSP KOTA PALEMBANG',
            heading: 'Struktur & Layanan'
        },
        content: [
            { page: '01', heading: 'Loket Pelayanan', body: 'Setiap permohonan diterima lewat loket terpadu, diverifikasi kelengkapan berkasnya, lalu diproses lintas bidang teknis terkait.' },
            { page: '02', heading: 'Tim Verifikasi', body: 'Petugas verifikasi meninjau kelayakan berkas dan menindaklanjuti laporan atau pengaduan yang masuk dari masyarakat.' },
            { page: '03', heading: 'Pengawasan Internal', body: 'Inspektorat internal memantau proses pelayanan agar tetap sesuai standar, termasuk menindak dugaan pelanggaran oleh petugas.' }
        ],
        backCover: { heading: 'Struktur', tagline: '& Layanan' }
    }
];

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_BOOKS));
}

async function getBooks() {
    let books = await getJSON(BOOKS_KEY);
    if (!books || !Array.isArray(books) || !books.length) {
        books = cloneDefaults();
        await setJSON(BOOKS_KEY, books);
    }
    return books;
}

async function saveBooks(books) {
    await setJSON(BOOKS_KEY, books);
    return books;
}

function findBook(books, bookIndex) {
    const book = books[bookIndex];
    if (!book) {
        const err = new Error('Buku tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }
    return book;
}

function getLeaf(book, leafType, contentIndex) {
    if (leafType === 'cover') return book.cover || (book.cover = {});
    if (leafType === 'back') return book.backCover || (book.backCover = {});
    if (leafType === 'content') {
        const leaf = book.content[contentIndex];
        if (!leaf) {
            const err = new Error('Halaman tidak ditemukan.');
            err.statusCode = 404;
            throw err;
        }
        return leaf;
    }
    const err = new Error('Jenis halaman tidak dikenali.');
    err.statusCode = 400;
    throw err;
}

// fields: object berisi teks yang mau diupdate (kicker/heading/body/tagline/page)
// image: opsional -- { buffer, mimeType, ext } kalau ada berkas baru yang diupload
async function updatePage(bookIndex, leafType, contentIndex, fields, image) {
    const books = await getBooks();
    const book = findBook(books, bookIndex);
    const leaf = getLeaf(book, leafType, contentIndex);

    Object.keys(fields || {}).forEach((key) => {
        if (fields[key] !== undefined) leaf[key] = fields[key];
    });

    if (image) {
        const prevImage = leaf.image;
        const blob = await put(`flipbook/page-${Date.now()}.${image.ext}`, image.buffer, {
            access: 'public',
            contentType: image.mimeType,
            addRandomSuffix: true
        });
        leaf.image = { url: blob.url, pathname: blob.pathname };

        // Hapus blob lama SETELAH yang baru berhasil tersimpan, sama kayak
        // pola di qrBgStore.js -- biar kalau ada yang gagal di tengah
        // jalan, gambar lama gak ilang percuma.
        if (prevImage && prevImage.pathname && prevImage.pathname !== blob.pathname) {
            del(prevImage.pathname).catch((err) => {
                console.error('[flipbookStore] Gagal hapus blob lama:', err);
            });
        }
    }

    await saveBooks(books);
    return book;
}

// Tambah halaman isi baru di akhir buku (sebelum sampul belakang).
async function addPage(bookIndex) {
    const books = await getBooks();
    const book = findBook(books, bookIndex);

    const nextNumber = book.content.length + 1;
    const newLeaf = {
        page: String(nextNumber).padStart(2, '0'),
        heading: 'Halaman Baru',
        body: 'Klik halaman ini untuk mulai mengedit isinya.'
    };
    book.content.push(newLeaf);

    await saveBooks(books);
    return book;
}

// Hapus satu halaman isi dari sebuah buku. Boleh sampai 0 halaman isi
// tersisa (struktur bukunya tetap valid -- sampul depan akan langsung
// nampilin sampul belakang di baliknya, gak error).
async function deletePage(bookIndex, contentIndex) {
    const books = await getBooks();
    const book = findBook(books, bookIndex);

    const idx = Number(contentIndex);
    if (!Number.isInteger(idx) || !book.content[idx]) {
        const err = new Error('Halaman tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }

    const [removedLeaf] = book.content.splice(idx, 1);

    // Nomor ulang label "Hal. XX" biar tetap urut rapi setelah salah satu
    // halaman di tengah dihapus (misal Hal 01,02,03 -> hapus 02 -> jadi
    // Hal 01,02 lagi, bukan 01,03 yang bolong).
    book.content.forEach((leaf, i) => {
        leaf.page = String(i + 1).padStart(2, '0');
    });

    await saveBooks(books);

    if (removedLeaf.image && removedLeaf.image.pathname) {
        del(removedLeaf.image.pathname).catch((err) => {
            console.error('[flipbookStore] Gagal hapus blob gambar halaman:', err);
        });
    }

    return book;
}

// Hapus satu buku secara keseluruhan (sampul depan, semua halaman isi,
// sampul belakang, sekalian semua gambar Blob yang nempel di
// dalamnya). Gak boleh hapus buku TERAKHIR yang tersisa -- minimal
// harus selalu ada 1 buku.
async function deleteBook(bookIndex) {
    const books = await getBooks();
    const book = findBook(books, bookIndex);

    if (books.length <= 1) {
        const err = new Error('Gak bisa hapus buku terakhir yang tersisa -- minimal harus ada 1 buku.');
        err.statusCode = 400;
        throw err;
    }

    books.splice(bookIndex, 1);
    await saveBooks(books);

    const pathnames = [];
    if (book.cover && book.cover.image && book.cover.image.pathname) pathnames.push(book.cover.image.pathname);
    if (book.backCover && book.backCover.image && book.backCover.image.pathname) pathnames.push(book.backCover.image.pathname);
    (book.content || []).forEach((leaf) => {
        if (leaf.image && leaf.image.pathname) pathnames.push(leaf.image.pathname);
    });

    if (pathnames.length) {
        del(pathnames).catch((err) => {
            console.error('[flipbookStore] Gagal hapus blob gambar buku:', err);
        });
    }

    return books;
}

module.exports = {
    getBooks,
    updatePage,
    addPage,
    deletePage,
    deleteBook
};