(() => {
    // ============================================================
    // REDESIGN: dulu file ini isinya carousel 3D yang muter (rotateY
    // per-frame, drag, scroll-linked, klik-buat-flip). Sekarang
    // tampilannya GRID BUKU STATIS niru referensi gambar -- semua
    // kartu langsung kelihatan sekaligus, gak ada rotasi/drag/flip
    // sama sekali. Hooks HTML (data-arc-carousel, data-arc-track,
    // data-arc-card, data-arc-title, data-arc-pdf) TETAP SAMA PERSIS,
    // jadi HTML kamu gak perlu diubah.
    //
    // Struktur per kartu sekarang: judul (caption) DI ATAS sampul,
    // sampul buku POLOS di tengah (gold spine + gold rivet, gak ada
    // teks/icon lagi di atasnya), lalu tombol "Unduh PDF" SELALU
    // kelihatan DI BAWAH sampul.
    //
    // CATATAN buat ScrubRevealAnimation.js (kalau masih manggil
    // instance.setProgress(t) tiap scroll): method-nya DIBIARIN ada
    // sebagai no-op di bawah, biar gak error "is not a function".
    // Kalau mau, integrasi scroll-nya bisa dicabut total di file itu
    // juga -- kirim aja filenya kalau mau dibersihin sekalian.
    // ============================================================

    class Arccarousel {
        constructor(root) {
            this.root = root;
            this.track = root.querySelector('[data-arc-track]');
            this.cards = Array.from(root.querySelectorAll('[data-arc-card]'));

            if (!this.track || !this.cards.length) return;

            this.cards.forEach((card) => this.renderBookCard(card));
        }

        // Bangun ulang isi satu kartu jadi struktur grid-buku statis:
        // caption (judul) -> cover (sampul polos + spine + rivet) ->
        // link PDF. Idempoten (aman dipanggil ulang) lewat flag
        // data-arc-wrapped, sama kayak versi lama.
        //
        // Sumber judul, urutan prioritas: atribut data-arc-title di
        // [data-arc-card], atau teks dari .info-card-title yang udah
        // ada di dalam kartu (kalau markup lama masih dipakai).
        //
        // Sumber link PDF: atribut data-arc-pdf di [data-arc-card],
        // WAJIB diisi manual per kartu di HTML, misal:
        // data-arc-pdf="/assets/pdf/buku-1.pdf". Kalau belum diisi,
        // tombolnya otomatis nonaktif ("PDF belum tersedia") biar gak
        // ada link rusak yang keklik.
        renderBookCard(card) {
            if (card.dataset.arcWrapped === '1') return;
            card.dataset.arcWrapped = '1';

            const existingTitleEl = card.querySelector('.info-card-title');
            const titleText = card.dataset.arcTitle || (existingTitleEl ? existingTitleEl.textContent.trim() : '');

            // Sampul di desain baru ini polos (niru referensi gambar) --
            // icon/title/text lama dibuang dari tampilan, judulnya udah
            // kepindah jadi caption di atas.
            card.innerHTML = '';
            card.classList.add('arc-card');

            const caption = document.createElement('p');
            caption.className = 'arc-card-caption';
            caption.textContent = titleText;

            const cover = document.createElement('div');
            cover.className = 'arc-card-cover';

            const spine = document.createElement('div');
            spine.className = 'arc-card-spine';
            const rivet = document.createElement('div');
            rivet.className = 'arc-card-rivet';
            cover.appendChild(spine);
            cover.appendChild(rivet);

            const pdfUrl = card.dataset.arcPdf || '';
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
        }

        // Stub biar kompatibel kalau masih ada file luar (misalnya
        // ScrubRevealAnimation.js) yang manggil ini tiap scroll --
        // sekarang gak ngapa-ngapain karena tampilannya statis.
        setProgress() {}

        destroy() {}
    }

    const init = () => {
        document.querySelectorAll('[data-arc-carousel]').forEach((el) => {
            if (!el.__arcCarouselInstance) {
                el.__arcCarouselInstance = new Arccarousel(el);
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