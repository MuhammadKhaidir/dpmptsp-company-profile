// data/arcCarouselStore.js
//
// Penyimpanan daftar BUKU di grid Arccarousel (judul + berkas PDF
// opsional per buku), buat fitur TAMBAH, EDIT & HAPUS buku. Mengikuti
// pola yang SAMA PERSIS dengan data/flipbookStore.js / data/qrBgStore.js:
// - Berkas PDF -> Vercel Blob (object storage).
// - Daftar buku (array of {id, title, pdfUrl, ...}) -> Upstash Redis,
//   disimpan sebagai SATU key JSON.
//
// Beda dari flipbookStore: gak ada data bawaan (DEFAULT_BOOKS) di sini.
// 5 kartu "Book" placeholder yang sebelumnya statis di index.html cuma
// dummy/belum diisi beneran, jadi grid ini SENGAJA mulai KOSONG --
// buku pertama diisi manual lewat tombol "Tambah Buku" di halaman.
//
// BARU: editBook(id, title, pdf) -- sebelumnya cuma ada addBook &
// deleteBook, jadi satu-satunya cara "ganti judul/PDF buku yang udah
// ada" adalah hapus lalu tambah ulang (ganti ID, ilang urutannya di
// array). editBook() update in-place: judul selalu diganti (wajib
// diisi, divalidasi juga di routes/arcCarouselContent.js), PDF cuma
// diganti kalau ada berkas baru yang dikirim -- kalau `pdf` null/
// undefined, pdfUrl & pdfPathname lama TETAP dipertahanin apa adanya.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

const BOOKS_KEY = 'arc-carousel:books';

async function getBooks() {
    const books = await getJSON(BOOKS_KEY);
    return Array.isArray(books) ? books : [];
}

async function saveBooks(books) {
    await setJSON(BOOKS_KEY, books);
    return books;
}

function makeId() {
    return 'book-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function findBook(books, id) {
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) {
        const err = new Error('Buku tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }
    return idx;
}

// pdf: opsional -- { buffer, mimeType } kalau ada berkas PDF yang diupload
async function addBook(title, pdf) {
    const books = await getBooks();

    const book = {
        id: makeId(),
        title: title,
        pdfUrl: '',
        pdfPathname: '',
        createdAt: Date.now()
    };

    if (pdf) {
        const blob = await put(`arc-carousel/${book.id}.pdf`, pdf.buffer, {
            access: 'public',
            contentType: pdf.mimeType || 'application/pdf',
            addRandomSuffix: true
        });
        book.pdfUrl = blob.url;
        book.pdfPathname = blob.pathname;
    }

    books.push(book);
    await saveBooks(books);
    return book;
}

// BARU: update in-place -- title selalu diganti (dipanggil dengan title
// yang udah divalidasi non-kosong di route handler). pdf opsional:
// - Kalau pdf ada -> upload blob baru dulu, baru timpa pdfUrl/pdfPathname
//   di object book, lalu hapus blob LAMA (fire-and-forget, sama kayak
//   pola cleanup di deleteBook -- gak nge-block response ke client).
// - Kalau pdf gak dikirim (null/undefined) -> pdfUrl & pdfPathname lama
//   dibiarin apa adanya, gak disentuh sama sekali.
async function editBook(id, title, pdf) {
    const books = await getBooks();
    const idx = findBook(books, id);
    const book = books[idx];

    book.title = title;

    if (pdf) {
        const oldPathname = book.pdfPathname;

        const blob = await put(`arc-carousel/${book.id}.pdf`, pdf.buffer, {
            access: 'public',
            contentType: pdf.mimeType || 'application/pdf',
            addRandomSuffix: true
        });
        book.pdfUrl = blob.url;
        book.pdfPathname = blob.pathname;

        if (oldPathname) {
            del(oldPathname).catch((err) => {
                console.error('[arcCarouselStore] Gagal hapus berkas PDF lama (edit):', err);
            });
        }
    }

    books[idx] = book;
    await saveBooks(books);
    return book;
}

async function deleteBook(id) {
    const books = await getBooks();
    const idx = findBook(books, id);
    const [removed] = books.splice(idx, 1);
    await saveBooks(books);

    if (removed.pdfPathname) {
        del(removed.pdfPathname).catch((err) => {
            console.error('[arcCarouselStore] Gagal hapus berkas PDF lama:', err);
        });
    }

    return removed;
}

module.exports = { getBooks, addBook, editBook, deleteBook };