(() => {
    // ============================================================
    // FITUR TAMBAH & HAPUS BUKU: grid buku sekarang di-render dari data
    // DINAMIS (fetch dari /api/arc-carousel/content), BUKAN dari kartu
    // statis [data-arc-card] di HTML lagi. 5 kartu placeholder "Book"
    // yang ada di index.html jadi gak kepakai lagi -- boleh dibiarin
    // aja di HTML (bakal ke-timpa otomatis), atau boleh dikosongin
    // biar rapi, dua-duanya aman.
    //
    // Tiap kartu punya tombol "×" kecil buat hapus, dan ada tombol
    // "+ Tambah Buku" di bawah grid. Keduanya lewat modal password,
    // pola sama kayak fitur edit FlipBook/QR (lihat routes/
    // arcCarouselContent.js + data/arcCarouselStore.js di backend).
    // ============================================================

    const API = {
        content: '/api/arc-carousel/content',
        add: '/api/arc-carousel/book/add',
        delete: '/api/arc-carousel/book/delete'
    };

    function el(tag, className) {
        const node = document.createElement(tag || 'div');
        if (className) node.className = className;
        return node;
    }

    class Arccarousel {
        constructor(root) {
            this.root = root;
            this.track = root.querySelector('[data-arc-track]');
            if (!this.track) return;

            this.books = [];
            this.modalState = null;
            this.fieldRefs = {};

            this.buildAddButton();
            this.buildModal();
            this.loadBooks();
        }

        async loadBooks() {
            this.track.innerHTML = '';
            const loading = el('p', 'arc-loading');
            loading.textContent = 'Memuat daftar buku...';
            this.track.appendChild(loading);

            try {
                const res = await fetch(API.content);
                const data = await res.json();
                this.books = (data && data.success && Array.isArray(data.books)) ? data.books : [];
            } catch (err) {
                console.warn('[Arccarousel] Gagal memuat daftar buku:', err);
                this.books = [];
            }

            this.renderBooks();
        }

        renderBooks() {
            this.track.innerHTML = '';

            if (!this.books.length) {
                const empty = el('p', 'arc-empty');
                empty.textContent = 'Belum ada buku. Klik "Tambah Buku" di bawah buat nambahin.';
                this.track.appendChild(empty);
                return;
            }

            this.books.forEach((book) => {
                this.track.appendChild(this.buildBookCard(book));
            });
        }

        buildBookCard(book) {
            const card = el('div', 'arc-card');

            const caption = el('p', 'arc-card-caption');
            caption.textContent = book.title || '';

            const cover = el('div', 'arc-card-cover');
            cover.appendChild(el('div', 'arc-card-spine'));
            cover.appendChild(el('div', 'arc-card-rivet'));

            const deleteBtn = el('button', 'arc-card-delete');
            deleteBtn.type = 'button';
            deleteBtn.setAttribute('aria-label', 'Hapus buku "' + (book.title || '') + '"');
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', () => this.openDeleteModal(book));
            cover.appendChild(deleteBtn);

            const pdfUrl = book.pdfUrl || '';
            const link = document.createElement(pdfUrl ? 'a' : 'span');
            link.className = pdfUrl ? 'arc-card-download' : 'arc-card-download is-disabled';
            link.textContent = pdfUrl ? 'Unduh PDF' : 'PDF belum tersedia';
            if (pdfUrl) {
                link.href = pdfUrl;
                link.setAttribute('download', '');
                link.target = '_blank';
                link.rel = 'noopener';
            }

            card.appendChild(caption);
            card.appendChild(cover);
            card.appendChild(link);
            return card;
        }

        buildAddButton() {
            const btn = el('button', 'arc-add-book-btn');
            btn.type = 'button';
            btn.textContent = '+ Tambah Buku';
            btn.addEventListener('click', () => this.openAddModal());
            this.root.appendChild(btn);
            this.addBtn = btn;
        }

        // Modal dibangun SEKALI, dipasang ke <body> (bukan di dalam
        // .arc-carousel) -- biar posisinya gak kena reflow/overflow dari
        // .arc-track yang sekarang bisa scroll internal.
        buildModal() {
            const overlay = el('div', 'arc-modal-overlay');
            overlay.hidden = true;

            const modal = el('div', 'arc-modal-box');
            overlay.appendChild(modal);

            const closeBtn = el('button', 'arc-modal-close');
            closeBtn.type = 'button';
            closeBtn.textContent = '×';
            closeBtn.setAttribute('aria-label', 'Tutup');
            modal.appendChild(closeBtn);

            const title = el('h4', 'arc-modal-title');
            modal.appendChild(title);

            const sub = el('p', 'arc-modal-sub');
            modal.appendChild(sub);

            const fieldsWrap = el('div', 'arc-modal-fields');
            modal.appendChild(fieldsWrap);

            const errorEl = el('p', 'arc-modal-error');
            errorEl.hidden = true;
            modal.appendChild(errorEl);

            const actions = el('div', 'arc-modal-actions');
            const cancelBtn = el('button', 'arc-modal-cancel');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Batal';
            const submitBtn = el('button', 'arc-modal-submit');
            submitBtn.type = 'button';
            actions.appendChild(cancelBtn);
            actions.appendChild(submitBtn);
            modal.appendChild(actions);

            document.body.appendChild(overlay);

            this.modalOverlay = overlay;
            this.modalTitleEl = title;
            this.modalSubEl = sub;
            this.modalFieldsWrap = fieldsWrap;
            this.modalErrorEl = errorEl;
            this.modalSubmitBtn = submitBtn;

            closeBtn.addEventListener('click', () => this.closeModal());
            cancelBtn.addEventListener('click', () => this.closeModal());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeModal();
            });
            submitBtn.addEventListener('click', () => this.submitModal());

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !this.modalOverlay.hidden) this.closeModal();
            });
        }

        addField(key, labelText, type) {
            const label = el('label', 'arc-modal-field-label');
            label.textContent = labelText;
            const input = el('input', 'arc-modal-field-input');
            input.type = type || 'text';
            if (type === 'file') input.accept = 'application/pdf';
            label.appendChild(input);
            this.modalFieldsWrap.appendChild(label);
            this.fieldRefs[key] = input;
        }

        openAddModal() {
            this.modalState = { mode: 'add' };
            this.modalTitleEl.textContent = 'Tambah Buku Baru';
            this.modalSubEl.textContent = 'Isi judul buku, dan (opsional) unggah berkas PDF-nya.';
            this.modalSubmitBtn.textContent = 'Tambah';

            this.modalFieldsWrap.innerHTML = '';
            this.fieldRefs = {};
            this.addField('title', 'Judul Buku', 'text');
            this.addField('pdf', 'Berkas PDF (opsional)', 'file');
            this.addField('password', 'Kata Sandi', 'password');

            this.modalErrorEl.hidden = true;
            this.modalOverlay.hidden = false;
        }

        openDeleteModal(book) {
            this.modalState = { mode: 'delete', book };
            this.modalTitleEl.textContent = 'Hapus Buku';
            this.modalSubEl.textContent = 'Yakin mau hapus buku "' + (book.title || '') + '"? Tindakan ini gak bisa dibatalkan.';
            this.modalSubmitBtn.textContent = 'Hapus';

            this.modalFieldsWrap.innerHTML = '';
            this.fieldRefs = {};
            this.addField('password', 'Kata Sandi', 'password');

            this.modalErrorEl.hidden = true;
            this.modalOverlay.hidden = false;
        }

        closeModal() {
            this.modalOverlay.hidden = true;
            this.modalState = null;
        }

        showModalError(msg) {
            this.modalErrorEl.textContent = msg;
            this.modalErrorEl.hidden = false;
        }

        async submitModal() {
            if (!this.modalState) return;
            const password = this.fieldRefs.password ? this.fieldRefs.password.value : '';
            if (!password) {
                this.showModalError('Kata sandi wajib diisi.');
                return;
            }

            this.modalSubmitBtn.disabled = true;
            this.modalErrorEl.hidden = true;

            try {
                if (this.modalState.mode === 'add') {
                    await this.submitAdd(password);
                } else {
                    await this.submitDelete(password);
                }
            } finally {
                this.modalSubmitBtn.disabled = false;
            }
        }

        async submitAdd(password) {
            const title = this.fieldRefs.title.value.trim();
            if (!title) {
                this.showModalError('Judul buku wajib diisi.');
                return;
            }

            const fd = new FormData();
            fd.append('title', title);
            fd.append('password', password);
            const file = this.fieldRefs.pdf.files && this.fieldRefs.pdf.files[0];
            if (file) fd.append('pdf', file);

            try {
                const res = await fetch(API.add, { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) {
                    this.showModalError(data.message || 'Gagal menambah buku.');
                    return;
                }
                this.books.push(data.book);
                this.renderBooks();
                this.closeModal();
            } catch (err) {
                console.error('[Arccarousel] Gagal menambah buku:', err);
                this.showModalError('Gagal terhubung ke server. Coba lagi.');
            }
        }

        async submitDelete(password) {
            const book = this.modalState.book;
            const fd = new FormData();
            fd.append('id', book.id);
            fd.append('password', password);

            try {
                const res = await fetch(API.delete, { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) {
                    this.showModalError(data.message || 'Gagal menghapus buku.');
                    return;
                }
                this.books = this.books.filter((b) => b.id !== book.id);
                this.renderBooks();
                this.closeModal();
            } catch (err) {
                console.error('[Arccarousel] Gagal menghapus buku:', err);
                this.showModalError('Gagal terhubung ke server. Coba lagi.');
            }
        }

        // Stub biar kompatibel kalau masih ada file luar yang manggil ini.
        setProgress() {}
        destroy() {}
    }

    const init = () => {
        document.querySelectorAll('[data-arc-carousel]').forEach((elRoot) => {
            if (!elRoot.__arcCarouselInstance) {
                elRoot.__arcCarouselInstance = new Arccarousel(elRoot);
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.Arccarousel = Arccarousel;
})();