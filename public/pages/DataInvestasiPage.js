/**
 * DataInvestasiPage
 * Halaman: Data Investasi
 *
 * PDF data investasi ditampilkan UTUH (visual sama persis kayak file aslinya)
 * langsung di dalam halaman — user gak perlu download / buka tab baru.
 * Pake PDF.js: tiap halaman PDF di-render ke <canvas>, plus text layer
 * transparan di atasnya biar teks tetap bisa di-select & di-search (Ctrl+F).
 *
 * PERLU DI index.html:
 *   <link rel="stylesheet" href="/css/pdf-viewer.css">
 *   <div id="data-investasi-content"></div>   <-- taruh di dalam #data-investasi-section
 *   <script src="/pages/DataInvestasiPage.js"></script>
 *
 * PERLU DI BACKEND:
 *   Endpoint GET /api/data-investasi yang return { pdfUrl: "https://...blob.../file.pdf" }
 *   (lihat contoh dataInvestasi.route.js)
 */

const PDFJS_VERSION = '4.0.379';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

class DataInvestasiPage {
    constructor() {
        this.pageName = 'Potensi Investasi';
        this.containerId = 'data-investasi-content';
        this.pdfjsLib = null;
        this.pdfDoc = null;
    }

    async init() {
        console.log('[' + this.pageName + '] initialized');

        try {
            if (!this.pdfjsLib) {
                // dynamic import ES module pdf.js, aman dipanggil dari script biasa (non-module)
                this.pdfjsLib = await import(`${PDFJS_BASE}/pdf.min.mjs`);
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
            }
        } catch (err) {
            console.error('Gagal load PDF.js:', err);
            this.showMessage('Gagal memuat komponen PDF viewer.', 'pdf-error');
            return;
        }

        const pdfUrl = await this.getPdfUrl();
        if (pdfUrl) {
            await this.renderPDF(pdfUrl);
        } else {
            this.showMessage('Belum ada dokumen Data Investasi yang di-upload.', 'pdf-empty');
        }
    }

    // Ambil URL PDF terbaru dari backend (URL Vercel Blob yang disimpen pas admin upload)
    async getPdfUrl() {
        try {
            const res = await fetch('/api/data-investasi');
            if (!res.ok) throw new Error('Response gak OK: ' + res.status);
            const data = await res.json();
            return data.pdfUrl || null; // sesuaikan nama field sama response API lo
        } catch (err) {
            console.error('Gagal ambil URL PDF:', err);
            return null;
        }
    }

    async renderPDF(url) {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container #' + this.containerId + ' gak ketemu di halaman.');
            return;
        }

        this.showMessage('Memuat dokumen...', 'pdf-loading');

        try {
            this.pdfDoc = await this.pdfjsLib.getDocument(url).promise;
            container.innerHTML = '';

            for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
                await this.renderPage(pageNum, container);
            }
        } catch (err) {
            console.error('Gagal render PDF:', err);
            this.showMessage('Gagal memuat dokumen PDF.', 'pdf-error');
        }
    }

    async renderPage(pageNum, container) {
        const page = await this.pdfDoc.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.style.width = viewport.width + 'px';
        pageWrapper.style.height = viewport.height + 'px';

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'pdf-page-canvas';
        pageWrapper.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'pdf-text-layer';
        pageWrapper.appendChild(textLayerDiv);

        container.appendChild(pageWrapper);

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        // text layer transparan di atas canvas, biar teks tetep bisa di-select & di-Ctrl+F
        const textContent = await page.getTextContent();
        this.pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
            textDivs: [],
        });
    }

    showMessage(text, className) {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `<p class="${className || ''}">${text}</p>`;
        }
    }

    destroy() {
        const container = document.getElementById(this.containerId);
        if (container) container.innerHTML = '';
        this.pdfDoc = null;
    }
}