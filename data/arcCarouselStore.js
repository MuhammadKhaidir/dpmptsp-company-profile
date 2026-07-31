// data/arcCarouselStore.js
// Penyimpanan sederhana berbasis file JSON untuk daftar buku di ArcCarousel.
// Polanya sama kayak store lain di project ini: baca-tulis ke file JSON
// di folder data/, gak pakai database eksternal.
//
// PENTING kalau dideploy ke Vercel: serverless function di Vercel punya
// filesystem read-only (kecuali /tmp, dan itu pun gak persisten antar
// request/deploy). Artinya nulis ke file JSON kayak gini CUMA jalan
// kalau dijalanin di server biasa (VPS/localhost), BUKAN di Vercel.
// Kalau mau tetep di Vercel, ganti store ini ke database beneran
// (mis. Vercel KV / Postgres / MongoDB Atlas).

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'arcCarouselBooks.json');

function ensureStoreFile() {
    if (!fs.existsSync(STORE_FILE)) {
        fs.writeFileSync(STORE_FILE, JSON.stringify({ books: [] }, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStoreFile();
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.books)) return { books: [] };
        return parsed;
    } catch (err) {
        console.error('[arcCarouselStore] Gagal baca store, reset ke kosong:', err);
        return { books: [] };
    }
}

function writeStore(data) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getBooks() {
    return readStore().books;
}

function addBook({ title, pdfUrl }) {
    const data = readStore();
    const newBook = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title,
        pdfUrl: pdfUrl || ''
    };
    data.books.push(newBook);
    writeStore(data);
    return newBook;
}

function deleteBook(id) {
    const data = readStore();
    const idx = data.books.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const [removed] = data.books.splice(idx, 1);
    writeStore(data);
    return removed;
}

module.exports = { getBooks, addBook, deleteBook, STORE_FILE };