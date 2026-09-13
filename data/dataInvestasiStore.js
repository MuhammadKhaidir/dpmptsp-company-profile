// data/dataInvestasiStore.js
//
// Penyimpanan berkas PDF "Data Investasi" -- SEKARANG BISA LEBIH DARI SATU
// tab/halaman, masing-masing nyimpen SATU dokumen PDF aktifnya sendiri.
// Ngikutin pola yang sama persis kayak data/flipbookStore.js: seluruh
// array halaman disimpan sebagai SATU key JSON di Upstash Redis, berkas
// PDF tiap halaman di Vercel Blob.
//
// MIGRASI OTOMATIS: kalau di Redis masih ada key lama
// `data-investasi:pdf` (format versi satu-dokumen sebelum fitur ini),
// dokumennya otomatis dipindah jadi tab pertama pas pertama kali
// getPages() dipanggil -- biar dokumen yang sudah di-upload admin
// sebelumnya gak ilang begitu aja pas fitur ini di-deploy.

const { put, del } = require('@vercel/blob');
const { getJSON, setJSON, delKey } = require('../lib/redisClient');

const PAGES_KEY = 'data-investasi:pages';
const LEGACY_PDF_KEY = 'data-investasi:pdf'; // format lama, single dokumen

function makeEmptyPage(label) {
    return {
        id: 'di-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        label: label || 'Halaman Baru',
        pdfUrl: null,
        pathname: null,
        originalName: null,
        updatedAt: null
    };
}

async function migrateLegacyIfNeeded() {
    const legacy = await getJSON(LEGACY_PDF_KEY);
    if (!legacy) return null;

    const page = makeEmptyPage('Data Investasi');
    page.pdfUrl = legacy.url || null;
    page.pathname = legacy.pathname || null;
    page.originalName = legacy.originalName || null;
    page.updatedAt = legacy.updatedAt || Date.now();

    await delKey(LEGACY_PDF_KEY);
    return page;
}

async function getPages() {
    let pages = await getJSON(PAGES_KEY);
    if (pages && Array.isArray(pages) && pages.length) return pages;

    // Belum ada data di format baru -- cek dulu apakah ada dokumen lama
    // (format satu-dokumen) yang perlu dipindah biar gak ilang.
    const migrated = await migrateLegacyIfNeeded();
    pages = migrated ? [migrated] : [makeEmptyPage('Halaman 1')];

    await setJSON(PAGES_KEY, pages);
    return pages;
}

async function savePages(pages) {
    await setJSON(PAGES_KEY, pages);
    return pages;
}

function findPage(pages, pageIndex) {
    const page = pages[pageIndex];
    if (!page) {
        const err = new Error('Halaman tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }
    return page;
}

// Tambah tab/halaman kosong baru di akhir daftar (belum ada PDF-nya).
async function addPage() {
    const pages = await getPages();
    const nextNumber = pages.length + 1;
    pages.push(makeEmptyPage('Halaman ' + nextNumber));
    await savePages(pages);
    return pages;
}

// Ganti nama (label) satu tab.
async function renamePage(pageIndex, label) {
    const pages = await getPages();
    const page = findPage(pages, pageIndex);

    const clean = (label || '').trim();
    if (!clean) {
        const err = new Error('Nama halaman tidak boleh kosong.');
        err.statusCode = 400;
        throw err;
    }

    page.label = clean.slice(0, 60);
    await savePages(pages);
    return pages;
}

// Hapus satu tab/halaman SELURUHNYA (termasuk berkas PDF-nya kalau ada).
// Gak boleh hapus tab TERAKHIR -- minimal harus selalu ada 1 tab tersisa.
async function deletePage(pageIndex) {
    const pages = await getPages();
    const page = findPage(pages, pageIndex);

    if (pages.length <= 1) {
        const err = new Error('Gak bisa hapus halaman terakhir yang tersisa -- minimal harus ada 1 halaman.');
        err.statusCode = 400;
        throw err;
    }

    pages.splice(pageIndex, 1);
    await savePages(pages);

    if (page.pathname) {
        del(page.pathname).catch((err) => {
            console.error('[dataInvestasiStore] Gagal hapus blob PDF halaman:', err);
        });
    }

    return pages;
}

// Upload/ganti dokumen PDF yang aktif buat SATU tab tertentu.
// params: { buffer, mimeType, originalName }
async function setPagePdf(pageIndex, { buffer, mimeType, originalName }) {
    const pages = await getPages();
    const page = findPage(pages, pageIndex);
    const prevPathname = page.pathname;

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

    page.pdfUrl = blob.url;
    page.pathname = blob.pathname;
    page.originalName = originalName || safeName;
    page.updatedAt = Date.now();

    await savePages(pages);

    // Hapus blob lama SETELAH yang baru berhasil tersimpan -- biar kalau
    // ada yang gagal di tengah jalan, dokumen lama gak ilang percuma.
    if (prevPathname && prevPathname !== blob.pathname) {
        del(prevPathname).catch((err) => {
            console.error('[dataInvestasiStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return pages;
}

// Hapus dokumen PDF SATU tab -- tab-nya SENDIRI tetap ada, cuma balik
// jadi kosong lagi (beda sama deletePage yang ngapus seluruh tab).
async function clearPagePdf(pageIndex) {
    const pages = await getPages();
    const page = findPage(pages, pageIndex);
    const prevPathname = page.pathname;

    page.pdfUrl = null;
    page.pathname = null;
    page.originalName = null;
    page.updatedAt = Date.now();

    await savePages(pages);

    if (prevPathname) {
        del(prevPathname).catch((err) => {
            console.error('[dataInvestasiStore] Gagal hapus blob PDF lama:', err);
        });
    }

    return pages;
}

module.exports = {
    getPages,
    addPage,
    renamePage,
    deletePage,
    setPagePdf,
    clearPagePdf
};