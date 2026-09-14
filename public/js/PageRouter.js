/**
 * PageRouter.js
 * Ganti "halaman" (section) tanpa reload / scroll panjang.
 * Klik nav -> section lama di-fade-out & dilepas dari layout,
 * section target di-mount & di-fade-in (cuma [data-fade-target]
 * di dalemnya yang kena opacity, section-nya sendiri cuma toggle display).
 *
 * FIX vs versi sebelumnya:
 * 1. Navbar (.hero-nav) sekarang dipindah ke HTML di luar section
 *    data-page="home" (lihat index.html), jadi gak ikut ke-display:none
 *    pas pindah halaman. Gak ada perubahan logic router buat ini.
 * 2. clearRevealState(): elemen [data-reveal] (biasanya dianimasikan
 *    SectionRevealAnimation.js lewat IntersectionObserver — blur ->
 *    tajam pas discroll ke viewport) gak sempat ke-trigger observernya
 *    karena PageRouter motong pindah halaman secara instan, bukan
 *    scroll asli. Makanya elemen itu nyangkut di state awal (blur).
 *    Fungsi ini maksa full-visible tiap kali halaman ditampilin.
 * 3. Dispatch event 'resize' abis pindah halaman, buat Leaflet map /
 *    Chart.js yang container-nya baru aja balik keliatan (sebelumnya
 *    display:none bikin ukurannya kebaca 0 dan render-nya jadi salah).
 * 4. BARU: PAGE_HOOKS['profil-kota'] -- FlipBookScroll.js ngitung posisi
 *    scroll-jack (pinStart/pinEnd) berdasarkan offsetTop section itu DI
 *    DOKUMEN. Angka itu jadi basi tiap kali section lain disembunyikan/
 *    ditampilin (tinggi dokumen berubah drastis), padahal FlipBookScroll
 *    cuma ngitung ulang itu sendiri kalau ada event scroll asli -- yang
 *    gak kejadian pas pindah halaman lewat router ini. Makanya nyangkut/
 *    lompat-lompat. Hook ini maksa recomputeBounds() + reset scroll +
 *    lepas paksa body-scroll-lock tiap kali halaman ini di-enter/exit.
 *
 * MAPPING SEMENTARA:
 *   Home                    -> hero
 *   Profil DPMPTSP          -> profil-section  (arc-carousel visi misi)
 *   Profil Kota Palembang   -> flipbook-section (belum pas, masih placeholder isi)
 *   Berita / Informasi      -> belum ada section, placeholder kosong
 *   Potensi Investasi       -> qr-section       (konten QR investasi)
 *   Sektor Unggulan         -> belum ada section, placeholder kosong
 *   Data Investasi          -> data-investasi-section (match asli)
 *   Kawasan & Peta          -> map-section      (match asli)
 *   Kontak                  -> belum ada section, placeholder kosong
 */

(function () {
    var FADE_DURATION = 450; // ms — samain sama transition di PageRouter.css

    // key = fragment href nav (tanpa #), value = key data-page di section target
    var NAV_TARGETS = {
        'home-section': 'home',
        'profil-dpmptsp-section': 'profil-dpmptsp',
        'profil-kota-section': 'profil-kota',
        'berita-section': 'berita',
        'QR-Kode': 'potensi-investasi',
        'sektor-unggulan-section': 'sektor-unggulan',
        'data-investasi-section': 'data-investasi',
        'map-section': 'kawasan-peta',
        'kontak-section': 'kontak',
    };

    // Paksa body keluar dari state "scroll-locked" ala FlipBookScroll,
    // apapun kondisinya -- aman dipanggil walau lagi gak ke-lock.
    function forceUnlockBody() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.paddingRight = '';
    }

    var PAGE_HOOKS = {
        'profil-kota': {
            onEnter: function () {
                var fb = window.__flipBookScrollInstance;
                if (!fb) return;
                if (fb.locked) {
                    fb.locked = false;
                    forceUnlockBody();
                }
                fb.lastScrollY = null;
                window.scrollTo(0, 0);
                fb.recomputeBounds();
                // FIX: dulu di sini progress dipaksa manual ke 0 -- padahal
                // progress=0 itu artinya buku pertama masih di state
                // "belum masuk" (invisible/mengecil), BUKAN posisi "cover
                // udah kebuka, siap dibaca". Makanya bukunya kayak "gak
                // muncul" sampai user neken tombol panah kanan/kiri dulu
                // (stepPage() yang sebenarnya mendorong progress ke zona
                // yang kebaca). resetToStart() nyamain persis sama state
                // awal yang dipakai constructor.
                fb.resetToStart();
            },
            onExit: function () {
                var fb = window.__flipBookScrollInstance;
                if (!fb) return;
                if (fb.locked) {
                    fb.locked = false;
                    forceUnlockBody();
                }
            }
        }
    };

    var currentKey = null;

    function clearRevealState(scope) {
        var stuck = scope.querySelectorAll('[data-reveal]');
        for (var i = 0; i < stuck.length; i++) {
            stuck[i].style.setProperty('opacity', '1', 'important');
            stuck[i].style.setProperty('filter', 'none', 'important');
            stuck[i].style.setProperty('transform', 'none', 'important');
        }
    }

    function showPage(pageKey, animate) {
        if (pageKey === currentKey) return;

        var target = document.querySelector('[data-page="' + pageKey + '"]');
        if (!target) {
            console.warn('[PageRouter] Section dengan data-page="' + pageKey + '" belum ada.');
            return;
        }

        var current = currentKey
            ? document.querySelector('[data-page="' + currentKey + '"]')
            : null;

        if (current) {
            current.classList.remove('is-page-visible');
            if (PAGE_HOOKS[currentKey] && PAGE_HOOKS[currentKey].onExit) {
                PAGE_HOOKS[currentKey].onExit();
            }
            setTimeout(function () {
                current.classList.remove('is-page-active');
            }, animate === false ? 0 : FADE_DURATION);
        }

        target.classList.add('is-page-active');
        // paksa reflow biar browser "notice" perubahan display sebelum opacity ditrigger
        void target.offsetWidth;

        if (animate === false) {
            target.classList.add('is-page-visible');
        } else {
            requestAnimationFrame(function () {
                target.classList.add('is-page-visible');
            });
        }

        clearRevealState(target);

        setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
        }, animate === false ? 0 : FADE_DURATION);

        if (PAGE_HOOKS[pageKey] && PAGE_HOOKS[pageKey].onEnter) {
            // 2 rAF -> pastiin display/layout section-nya udah settle
            // dulu sebelum FlipBookScroll ngukur offsetTop/offsetHeight-nya
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    PAGE_HOOKS[pageKey].onEnter();
                });
            });
        }

        currentKey = pageKey;
    }

    function handleNavClick(e) {
        var link = e.target.closest('.nav-pill[href], .dropdown-item[href]');
        if (!link) return;

        var hash = link.getAttribute('href').replace('#', '');
        var pageKey = NAV_TARGETS[hash];
        if (!pageKey) return; // href gak dikenal router, biarin behavior default browser

        e.preventDefault();
        showPage(pageKey);

        // tutup dropdown yang lagi kebuka (kalau NavDropdown.js pake class ini)
        var openDropdown = link.closest('.nav-dropdown');
        if (openDropdown) openDropdown.classList.remove('is-open');
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('click', handleNavClick);
        showPage('home', false); // tampilin Home langsung tanpa animasi pas awal load
    });
})();