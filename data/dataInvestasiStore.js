// data/dataInvestasiStore.js
//
// Penyimpanan berkas PDF "Data Investasi" -- HANYA SATU dokumen aktif
// dalam satu waktu. Ngikutin pola yang sama persis kayak qrDocStore.js /
// flipbookStore.js: metadata di Upstash Redis, berkas PDF di Vercel Blob.
//
// Dokumen ini SIFATNYA PERMANEN -- sekali admin upload, otomatis
// ditampilkan di halaman Data Investasi dan TETAP aktif sampai ada admin
// yang upload dokumen baru (otomatis gantiin yang lama) atau eksplisit
// menghapusnya lewat clearPdf(). Gak ada expiry / auto-hapus.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const PDF_KEY = 'data-investasi:pdf';

// entry: { url, pathname, originalName, updatedAt }
async function getPdf() {
    return getJSON(PDF_KEY);
}

// params: { buffer, mimeType, originalName }
async function setPdf({ buffer, mimeType, originalName }) {
    const prev = await getPdf();

    // Nama file di Blob dibikin aman -- bukan langsung originalName
    // mentah, biar gak ada masalah karakter aneh/spasi di URL.
    const safeName = (originalName || 'dokumen.pdf')
        .replace(/[^a-zA-Z0-9.\-_]/g, '-')
        .slice(-100);

    const blob = await put(`data-investasi/${Date.now()}-${safeName}`, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: true
    });

    const entry = {
        url: blob.url,
        pathname: blob.pathname,
        originalName: originalName || safeName,
        updatedAt: Date.now()
    };

    await setJSON(PDF_KEY, entry);

    // Hapus blob lama SETELAH yang baru berhasil tersimpan -- biar kalau
    // ada yang gagal di tengah jalan, dokumen lama gak ilang percuma.
    if (prev && prev.pathname && prev.pathname !== blob.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[dataInvestasiStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return entry;
}

async function clearPdf() {
    const prev = await getPdf();
    await delKey(PDF_KEY);

    if (prev && prev.pathname) {
        del(prev.pathname).catch((err) => {
            console.error('[dataInvestasiStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return null;
}

module.exports = { getPdf, setPdf, clearPdf };