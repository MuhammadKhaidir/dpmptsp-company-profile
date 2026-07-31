// data/arcCarouselStore.js
//
// Penyimpanan daftar buku ArcCarousel untuk lingkungan SERVERLESS (Vercel).
// Mengikuti pola yang SAMA PERSIS dengan data/qrBgStore.js:
// - Berkas PDF -> Vercel Blob (object storage, bukan disk).
// - Metadata (daftar buku)  -> Upstash Redis.
//
// Kenapa gak pakai fs.writeFileSync ke folder data/ lagi: filesystem-nya
// read-only di Vercel, jadi versi itu gak akan pernah persisten di
// production -- persis alasan yang sama kayak qrBgStore.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON } = require('../lib/redisClient');

const BOOKS_KEY = 'arc-carousel:books';

async function getBooks() {
    const books = await getJSON(BOOKS_KEY);
    return Array.isArray(books) ? books : [];
}

async function saveBooks(books) {
    await setJSON(BOOKS_KEY, books);
}

// params: { title, file: { buffer, mimeType } | null }
async function addBook({ title, file }) {
    const books = await getBooks();

    let pdfUrl = '';
    let pathname = '';

    if (file) {
        const blob = await put(`arc-carousel/books/${Date.now()}.pdf`, file.buffer, {
            access: 'public',
            contentType: 'application/pdf',
            addRandomSuffix: true
        });
        pdfUrl = blob.url;
        pathname = blob.pathname;
    }

    const newBook = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title,
        pdfUrl,
        pathname,
        createdAt: Date.now()
    };

    books.push(newBook);
    await saveBooks(books);
    return newBook;
}

async function deleteBook(id) {
    const books = await getBooks();
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) return null;

    const [removed] = books.splice(idx, 1);
    await saveBooks(books);

    // Hapus blob PDF-nya SETELAH metadata berhasil diupdate -- pola sama
    // kayak qrBgStore: kalau ini gagal di tengah jalan, daftar bukunya
    // minimal udah bener duluan.
    if (removed.pathname) {
        del(removed.pathname).catch((err) => {
            console.error('[arcCarouselStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return removed;
}

module.exports = { getBooks, addBook, deleteBook };