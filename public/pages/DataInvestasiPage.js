/**
 * DataInvestasiPage
 * PDF data investasi ditampilkan UTUH langsung di halaman pake PDF.js.
 * BISA LEBIH DARI SATU TAB/HALAMAN -- tiap tab nyimpen satu PDF aktifnya
 * sendiri. Tambah tab baru, ganti nama tab, hapus tab, dan upload/ganti/
 * hapus PDF di tiap tab, cuma bisa ADMIN yang lagi login (dicek lewat
 * /api/auth/check-session) -- pola sama persis kayak Arccarousel.js:
 * otorisasi dari sesi admin, bukan password per-aksi.
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
        this.pageName = 'Data Investasi';
        this.containerId = 'data-investasi-container'; // FIX: samain sama ID asli di index.html
        this.pdfjsLib = null;
        this.pdfDoc = null;
        this.isAdmin = false;
        this.pages = [];
        this.activeIndex = 0;
        this.modalOverlay = null;
        this.modalMode = null; // 'upload' | 'delete' | 'deleteTab'
        this.modalTargetIndex = null;
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

    async fetchPages() {
        try {
            const res = await fetch('/api/data-investasi');
            if (!res.ok) throw new Error('Response gak OK: ' + res.status);
            const data = await res.json();
            return Array.isArray(data.pages) ? data.pages : [];
        } catch (err) {
            console.error('Gagal ambil data dokumen:', err);
            return null;
        }
    }

    // keepIndex: index tab yang mau tetap aktif setelah refresh (misal
    // abis upload/rename di tab yang sama, atau abis nambah tab baru).
    // Kalau gak dikasih / udah gak valid lagi, jatuh balik ke tab
    // terakhir yang valid.
    async refresh(keepIndex) {
        const pages = await this.fetchPages();
        if (pages === null) {
            this.showState('<p class="di-error">Gagal memuat dokumen PDF.</p>');
            return;
        }

        this.pages = pages;
        if (typeof keepIndex === 'number' && keepIndex >= 0 && keepIndex < pages.length) {
            this.activeIndex = keepIndex;
        } else if (this.activeIndex >= pages.length) {
            this.activeIndex = Math.max(0, pages.length - 1);
        }

        await this.render();
    }

    async render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container #' + this.containerId + ' gak ketemu di halaman.');
            return;
        }

        container.innerHTML = '';
        container.appendChild(this.buildTabBar());

        const body = el('div', 'di-tab-body');
        container.appendChild(body);

        const activePage = this.pages[this.activeIndex];
        if (!activePage) {
            body.innerHTML = '<p class="di-loading">Belum ada halaman.</p>';
            return;
        }

        if (activePage.pdfUrl) {
            await this.renderPDF(activePage, body);
        } else {
            this.renderEmpty(body);
        }
    }

    buildTabBar() {
        const bar = el('div', 'di-tabbar');

        this.pages.forEach((page, index) => {
            const tab = el('div', 'di-tab' + (index === this.activeIndex ? ' di-tab--active' : ''));

            const label = el('span', 'di-tab__label');
            label.textContent = page.label || ('Halaman ' + (index + 1));
            label.title = page.label || '';
            label.addEventListener('click', () => this.switchTab(index));
            tab.appendChild(label);

            if (this.isAdmin) {
                const renameBtn = el('button', 'di-tab__rename');
                renameBtn.type = 'button';
                renameBtn.title = 'Ganti nama halaman';
                renameBtn.textContent = '\u270e';
                renameBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.startRename(tab, label, index);
                });
                tab.appendChild(renameBtn);

                if (this.pages.length > 1) {
                    const closeBtn = el('button', 'di-tab__close');
                    closeBtn.type = 'button';
                    closeBtn.title = 'Hapus halaman ini';
                    closeBtn.textContent = '\u00d7';
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openDeleteTabModal(index);
                    });
                    tab.appendChild(closeBtn);
                }
            }

            bar.appendChild(tab);
        });

        if (this.isAdmin) {
            const addBtn = el('button', 'di-tab-add');
            addBtn.type = 'button';
            addBtn.title = 'Tambah halaman baru';
            addBtn.textContent = '+ Halaman';
            addBtn.addEventListener('click', () => this.addTab());
            bar.appendChild(addBtn);
        }

        return bar;
    }

    switchTab(index) {
        if (index === this.activeIndex) return;
        this.activeIndex = index;
        this.render();
    }

    startRename(tabEl, labelEl, index) {
        const currentValue = this.pages[index].label || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'di-tab__rename-input';
        input.value = currentValue;
        input.maxLength = 60;

        tabEl.replaceChild(input, labelEl);
        input.focus();
        input.select();

        let settled = false;
        const commit = () => {
            if (settled) return;
            settled = true;
            const newLabel = input.value.trim();
            if (newLabel && newLabel !== currentValue) {
                this.submitRename(index, newLabel);
            } else {
                this.render();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); settled = true; this.render(); }
        });
        input.addEventListener('blur', commit);
    }

    async submitRename(index, label) {
        try {
            const fd = new FormData();
            fd.append('pageIndex', index);
            fd.append('label', label);
            const res = await fetch('/api/data-investasi/page/rename', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                console.error('[DataInvestasi] Gagal ganti nama:', data.message);
            }
        } catch (err) {
            console.error('[DataInvestasi] Gagal ganti nama:', err);
        }
        await this.refresh(index);
    }

    async addTab() {
        try {
            const res = await fetch('/api/data-investasi/page/add', {
                method: 'POST',
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                console.error('[DataInvestasi] Gagal tambah halaman:', data.message);
                return;
            }
            // Langsung pindah ke tab baru (selalu ditambahkan di paling akhir).
            await this.refresh(data.pages.length - 1);
        } catch (err) {
            console.error('[DataInvestasi] Gagal tambah halaman:', err);
        }
    }

    renderEmpty(body) {
        body.innerHTML = '';
        const msg = el('p', 'di-loading');
        msg.textContent = 'Belum ada dokumen di halaman ini.';
        body.appendChild(msg);

        if (this.isAdmin) {
            const uploadBtn = el('button', 'di-admin-btn');
            uploadBtn.type = 'button';
            uploadBtn.style.marginTop = '12px';
            uploadBtn.textContent = '+ Upload PDF';
            uploadBtn.addEventListener('click', () => this.openUploadModal(this.activeIndex));
            body.appendChild(uploadBtn);
        }
    }

    async renderPDF(page, body) {
        const { pdfUrl, originalName } = page;
        body.innerHTML = '<p class="di-loading">Memuat dokumen...</p>';

        try {
            this.pdfDoc = await this.pdfjsLib.getDocument(pdfUrl).promise;

            body.innerHTML = `
                <div class="di-toolbar">
                    <span class="di-toolbar__name">${this.escapeHtml(originalName || '')}</span>
                    <div class="di-toolbar__actions">
                        <a class="di-toolbar__download" href="${pdfUrl}" target="_blank" rel="noopener">Unduh PDF</a>
                    </div>
                </div>
                <div class="di-pages"></div>
            `;

            if (this.isAdmin) {
                const actions = body.querySelector('.di-toolbar__actions');

                const changeBtn = el('button', 'di-admin-btn');
                changeBtn.type = 'button';
                changeBtn.textContent = 'Ganti PDF';
                changeBtn.addEventListener('click', () => this.openUploadModal(this.activeIndex));
                actions.appendChild(changeBtn);

                const deleteBtn = el('button', 'di-admin-btn di-admin-btn--danger');
                deleteBtn.type = 'button';
                deleteBtn.textContent = 'Hapus';
                deleteBtn.addEventListener('click', () => this.openDeleteModal(this.activeIndex));
                actions.appendChild(deleteBtn);
            }

            const pagesEl = body.querySelector('.di-pages');
            for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
                await this.renderPage(pageNum, pagesEl);
            }
        } catch (err) {
            console.error('Gagal render PDF:', err);
            body.innerHTML = '<p class="di-error">Gagal memuat dokumen PDF.</p>';
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

    /* ---------------- Modal admin: upload/hapus PDF & hapus tab ---------------- */

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

    openUploadModal(pageIndex) {
        const page = this.pages[pageIndex];
        this.modalMode = 'upload';
        this.modalTargetIndex = pageIndex;
        this.modalTitleEl.textContent = page && page.pdfUrl ? 'Ganti Dokumen PDF' : 'Upload Dokumen PDF';
        this.modalSubEl.textContent = 'Pilih berkas PDF (maks. 4MB) untuk halaman "' + (page ? page.label : '') + '". Dokumen lama di halaman ini otomatis diganti.';
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

    openDeleteModal(pageIndex) {
        const page = this.pages[pageIndex];
        this.modalMode = 'delete';
        this.modalTargetIndex = pageIndex;
        this.modalTitleEl.textContent = 'Hapus Dokumen PDF';
        this.modalSubEl.textContent = 'Yakin mau hapus dokumen "' + (page ? page.originalName : '') + '" di halaman "' + (page ? page.label : '') + '"? Tindakan ini tidak bisa dibatalkan.';
        this.modalSubmitBtn.textContent = 'Hapus';

        this.modalFieldsWrap.innerHTML = '';
        this.modalFileInput = null;

        this.modalErrorEl.hidden = true;
        this.modalOverlay.hidden = false;
    }

    openDeleteTabModal(pageIndex) {
        const page = this.pages[pageIndex];
        this.modalMode = 'deleteTab';
        this.modalTargetIndex = pageIndex;
        this.modalTitleEl.textContent = 'Hapus Halaman';
        this.modalSubEl.textContent = 'Yakin mau hapus halaman "' + (page ? page.label : '') + '" beserta dokumen di dalamnya? Tindakan ini tidak bisa dibatalkan.';
        this.modalSubmitBtn.textContent = 'Hapus Halaman';

        this.modalFieldsWrap.innerHTML = '';
        this.modalFileInput = null;

        this.modalErrorEl.hidden = true;
        this.modalOverlay.hidden = false;
    }

    closeModal() {
        this.modalOverlay.hidden = true;
        this.modalMode = null;
        this.modalTargetIndex = null;
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
            } else if (this.modalMode === 'delete') {
                await this.submitDelete();
            } else if (this.modalMode === 'deleteTab') {
                await this.submitDeleteTab();
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
        fd.append('pageIndex', this.modalTargetIndex);

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
            const targetIndex = this.modalTargetIndex;
            this.closeModal();
            await this.refresh(targetIndex);
        } catch (err) {
            console.error('[DataInvestasi] Gagal upload:', err);
            this.showModalError('Gagal terhubung ke server. Coba lagi.');
        }
    }

    async submitDelete() {
        try {
            const fd = new FormData();
            fd.append('pageIndex', this.modalTargetIndex);
            const res = await fetch('/api/data-investasi/delete', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                this.showModalError(data.message || 'Gagal menghapus dokumen.');
                return;
            }
            const targetIndex = this.modalTargetIndex;
            this.closeModal();
            await this.refresh(targetIndex);
        } catch (err) {
            console.error('[DataInvestasi] Gagal hapus:', err);
            this.showModalError('Gagal terhubung ke server. Coba lagi.');
        }
    }

    async submitDeleteTab() {
        try {
            const fd = new FormData();
            fd.append('pageIndex', this.modalTargetIndex);
            const res = await fetch('/api/data-investasi/page/delete', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin'
            });
            const data = await res.json();
            if (!data.success) {
                this.showModalError(data.message || 'Gagal menghapus halaman.');
                return;
            }
            const deletedIndex = this.modalTargetIndex;
            this.closeModal();
            // Abis satu tab dihapus, jatuh ke tab sebelah kiri kalau ada,
            // atau tetap di tab pertama kalau yang dihapus tab paling awal.
            const nextIndex = Math.max(0, deletedIndex - 1);
            await this.refresh(nextIndex);
        } catch (err) {
            console.error('[DataInvestasi] Gagal hapus halaman:', err);
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

// bootstrap sendiri -- sebelumnya gak ada satupun kode yang manggil
// new DataInvestasiPage().init(), jadi class ini gak pernah jalan walau
// sudah ke-load. Pola sama kayak init() di Arccarousel.js.
(function () {
    function boot() {
        if (window.__dataInvestasiPageInstance) return;
        var page = new DataInvestasiPage();
        window.__dataInvestasiPageInstance = page;
        page.init();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();