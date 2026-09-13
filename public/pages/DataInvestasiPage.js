/**
 * DataInvestasiPage
 * PDF data investasi ditampilkan UTUH langsung di halaman pake PDF.js.
 * Upload/ganti/hapus dokumen cuma bisa ADMIN yang lagi login (dicek
 * lewat /api/auth/check-session) -- pola sama persis kayak
 * Arccarousel.js: otorisasi dari sesi admin, bukan password per-aksi.
 *
 * PERLU DI index.html:
 *   <link rel="stylesheet" href="/css/DataInvestasi.css">
 *   <div id="data-investasi-content"></div>
 *   <script src="/pages/DataInvestasiPage.js"></script>
 */

const PDFJS_VERSION = '4.0.379';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

class DataInvestasiPage {
    constructor() {
        this.pageName = 'Potensi Investasi';
        this.containerId = 'data-investasi-content';
        this.pdfjsLib = null;
        this.pdfDoc = null;
        this.isAdmin = false;
        this.meta = null;
        this.modalOverlay = null;
        this.modalMode = null;
    }

    async init() {
        console.log('[' + this.pageName + '] initialized');

        await this.loadAdminStatus();
        this.buildModal();

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

        await this.refresh();
    }

    loadAdminStatus() {
        return fetch('/api/auth/check-session')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                this.isAdmin = !!(data && data.logged_in && data.role === 'admin');
            })
            .catch(() => {
                this.isAdmin = false;
            });
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

    async refresh() {
        this.meta = await this.getMeta();
        if (this.meta && this.meta.pdfUrl) {
            await this.renderPDF(this.meta);
        } else {
            this.renderEmpty();
        }
    }

    renderEmpty() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        const msg = el('p', 'di-loading');
        msg.textContent = 'Belum ada dokumen Data Investasi yang di-upload.';
        container.appendChild(msg);

        if (this.isAdmin) {
            const uploadBtn = el('button', 'di-admin-btn');
            uploadBtn.type = 'button';
            uploadBtn.style.marginTop = '12px';
            uploadBtn.textContent = '+ Upload PDF';
            uploadBtn.addEventListener('click', () => this.openUploadModal());
            container.appendChild(uploadBtn);
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
                        <span class="di-toolbar__name">${this.escapeHtml(originalName)}</span>
                        <div class="di-toolbar__actions">
                            <a class="di-toolbar__download" href="${pdfUrl}" target="_blank" rel="noopener">Unduh PDF</a>
                        </div>
                    </div>
                    <div class="di-pages"></div>
                </div>
            `;

            if (this.isAdmin) {
                const actions = container.querySelector('.di-toolbar__actions');

                const changeBtn = el('button', 'di-admin-btn');
                changeBtn.type = 'button';
                changeBtn.textContent = 'Ganti PDF';
                changeBtn.addEventListener('click', () => this.openUploadModal());
                actions.appendChild(changeBtn);

                const deleteBtn = el('button', 'di-admin-btn di-admin-btn--danger');
                deleteBtn.type = 'button';
                deleteBtn.textContent = 'Hapus';
                deleteBtn.addEventListener('click', () => this.openDeleteModal());
                actions.appendChild(deleteBtn);
            }

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

        const pageWrap = el('div', 'di-page-wrap');
        pageWrap.style.width = viewport.width + 'px';

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'di-page';
        pageWrap.appendChild(canvas);

        const textLayerDiv = el('div', 'di-text-layer');
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

    /* ---------------- Modal admin: upload/ganti & hapus ---------------- */

    buildModal() {
        if (this.modalOverlay) return;

        const overlay = el('div', 'di-modal-overlay');
        overlay.hidden = true;

        const box = el('div', 'di-modal-box');
        overlay.appendChild(box);

        const closeBtn = el('button', 'di-modal-close');
        closeBtn.type = 'button';
        closeBtn.textContent = '\u00d7';
        box.appendChild(closeBtn);

        const title = el('h4', 'di-modal-title');
        box.appendChild(title);

        const sub = el('p', 'di-modal-sub');
        box.appendChild(sub);

        const fieldsWrap = el('div', 'di-modal-fields');
        box.appendChild(fieldsWrap);

        const errorEl = el('p', 'di-modal-error');
        errorEl.hidden = true;
        box.appendChild(errorEl);

        const actions = el('div', 'di-modal-actions');
        const cancelBtn = el('button', 'di-modal-cancel');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Batal';
        const submitBtn = el('button', 'di-modal-submit');
        submitBtn.type = 'button';
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        box.appendChild(actions);

        document.body.appendChild(overlay);

        this.modalOverlay = overlay;
        this.modalTitleEl = title;
        this.modalSubEl = sub;
        this.modalFieldsWrap = fieldsWrap;
        this.modalErrorEl = errorEl;
        this.modalSubmitBtn = submitBtn;
        this.modalFileInput = null;

        closeBtn.addEventListener('click', () => this.closeModal());
        cancelBtn.addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });
        submitBtn.addEventListener('click', () => this.submitModal());
    }

    openUploadModal() {
        this.modalMode = 'upload';
        this.modalTitleEl.textContent = this.meta && this.meta.pdfUrl ? 'Ganti Dokumen PDF' : 'Upload Dokumen PDF';
        this.modalSubEl.textContent = 'Pilih berkas PDF (maks. 4MB). Dokumen lama otomatis diganti.';
        this.modalSubmitBtn.textContent = 'Upload';

        this.modalFieldsWrap.innerHTML = '';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/pdf';
        this.modalFieldsWrap.appendChild(fileInput);
        this.modalFileInput = fileInput;

        this.modalErrorEl.hidden = true;
        this.modalOverlay.hidden = false;
    }

    openDeleteModal() {
        this.modalMode = 'delete';
        this.modalTitleEl.textContent = 'Hapus Dokumen PDF';
        this.modalSubEl.textContent = 'Yakin mau hapus dokumen "' + (this.meta ? this.meta.originalName : '') + '"? Tindakan ini tidak bisa dibatalkan.';
        this.modalSubmitBtn.textContent = 'Hapus';

        this.modalFieldsWrap.innerHTML = '';
        this.modalFileInput = null;

        this.modalErrorEl.hidden = true;
        this.modalOverlay.hidden = false;
    }

    closeModal() {
        this.modalOverlay.hidden = true;
        this.modalMode = null;
    }

    showModalError(msg) {
        this.modalErrorEl.textContent = msg;
        this.modalErrorEl.hidden = false;
    }

    async submitModal() {
        this.modalSubmitBtn.disabled = true;
        this.modalErrorEl.hidden = true;
        try {
            if (this.modalMode === 'upload') {
                await this.submitUpload();
            } else {
                await this.submitDelete();
            }
        } finally {
            this.modalSubmitBtn.disabled = false;
        }
    }

    async submitUpload() {
        const file = this.modalFileInput && this.modalFileInput.files && this.modalFileInput.files[0];
        if (!file) {
            this.showModalError('Pilih berkas PDF dulu.');
            return;
        }
        if (file.type !== 'application/pdf') {
            this.showModalError('Berkas harus berformat PDF.');
            return;
        }

        const fd = new FormData();
        fd.append('pdf', file);

        try {
            const res = await fetch('/api/data-investasi/upload', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                this.showModalError(data.message || 'Gagal mengunggah dokumen.');
                return;
            }
            this.closeModal();
            await this.refresh();
        } catch (err) {
            console.error('[DataInvestasi] Gagal upload:', err);
            this.showModalError('Gagal terhubung ke server. Coba lagi.');
        }
    }

    async submitDelete() {
        try {
            const res = await fetch('/api/data-investasi/delete', {
                method: 'POST',
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                this.showModalError(data.message || 'Gagal menghapus dokumen.');
                return;
            }
            this.closeModal();
            await this.refresh();
        } catch (err) {
            console.error('[DataInvestasi] Gagal hapus:', err);
            this.showModalError('Gagal terhubung ke server. Coba lagi.');
        }
    }

    /* ---------------- Util ---------------- */

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