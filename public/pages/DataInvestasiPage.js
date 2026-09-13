/**
 * DataInvestasiPage
 * PDF data investasi ditampilkan UTUH langsung di halaman pake PDF.js.
 *
 * PERLU DI index.html:
 *   <link rel="stylesheet" href="/css/DataInvestasi.css">
 *   <div id="data-investasi-content"></div>
 *   <script src="/pages/DataInvestasiPage.js"></script>
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
                this.pdfjsLib = await import(`${PDFJS_BASE}/pdf.min.mjs`);
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
            }
        } catch (err) {
            console.error('Gagal load PDF.js:', err);
            this.showState('<p class="di-error">Gagal memuat komponen PDF viewer.</p>');
            return;
        }

        const meta = await this.getMeta();
        if (meta && meta.pdfUrl) {
            await this.renderPDF(meta);
        } else {
            this.showState('<p class="di-loading">Belum ada dokumen Data Investasi yang di-upload.</p>');
        }
    }

    async getMeta() {
        try {
            const res = await fetch('/api/data-investasi');
            if (!res.ok) throw new Error('Response gak OK: ' + res.status);
            const data = await res.json();
            return { pdfUrl: data.pdfUrl || null, originalName: data.originalName || 'Data Investasi.pdf' };
        } catch (err) {
            console.error('Gagal ambil data dokumen:', err);
            return null;
        }
    }

    async renderPDF({ pdfUrl, originalName }) {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container #' + this.containerId + ' gak ketemu di halaman.');
            return;
        }

        this.showState('<p class="di-loading">Memuat dokumen...</p>');

        try {
            this.pdfDoc = await this.pdfjsLib.getDocument(pdfUrl).promise;

            container.innerHTML = `
                <div class="di-scene">
                    <div class="di-toolbar">
                        <span>${this.escapeHtml(originalName)}</span>
                        <a class="di-toolbar__download" href="${pdfUrl}" target="_blank" rel="noopener">Unduh PDF</a>
                    </div>
                    <div class="di-pages"></div>
                </div>
            `;

            const pagesEl = container.querySelector('.di-pages');
            for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
                await this.renderPage(pageNum, pagesEl);
            }
        } catch (err) {
            console.error('Gagal render PDF:', err);
            this.showState('<p class="di-error">Gagal memuat dokumen PDF.</p>');
        }
    }

    async renderPage(pageNum, pagesEl) {
        const page = await this.pdfDoc.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const pageWrap = document.createElement('div');
        pageWrap.className = 'di-page-wrap';
        pageWrap.style.width = viewport.width + 'px';

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'di-page';
        pageWrap.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'di-text-layer';
        pageWrap.appendChild(textLayerDiv);

        pagesEl.appendChild(pageWrap);

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const textContent = await page.getTextContent();
        this.pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
            textDivs: [],
        });
    }

    showState(html) {
        const container = document.getElementById(this.containerId);
        if (container) container.innerHTML = html;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    destroy() {
        const container = document.getElementById(this.containerId);
        if (container) container.innerHTML = '';
        this.pdfDoc = null;
    }
}