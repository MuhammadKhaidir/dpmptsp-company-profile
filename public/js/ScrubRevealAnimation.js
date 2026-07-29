

(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

    const wrap = document.getElementById('profil-section');
    if (!wrap) return;

    const words = Array.from(wrap.querySelectorAll('.scrub-word'));
    const content = document.getElementById('profilVisiMisiContent');
    const carouselRoot = wrap.querySelector('[data-arc-carousel]');

    if (!words.length || !content) return;

    const WORDS_PHASE_END = 0.52;
    const CONTENT_FADE_SPAN = 0.16;
    // Titik mulai fade-in .scrub-content (judul + carousel).
    const CONTENT_PHASE_START = WORDS_PHASE_END - 0.06; // 0.46
    // Titik konten udah full opacity -> mulai dari sini sampai progress=1,
    // sisa scroll didedikasiin buat nge-scrub carousel (lihat CAROUSEL SCRUB).
    const CAROUSEL_PHASE_START = CONTENT_PHASE_START + CONTENT_FADE_SPAN; // 0.62

    let ticking = false;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const mapRange = (v, inMin, inMax, outMin, outMax) => {
        const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
        return outMin + t * (outMax - outMin);
    };

    const wordSlices = words.map((_, index) => {
        const sliceWidth = WORDS_PHASE_END / words.length;
        const start = index * sliceWidth;
        const end = start + sliceWidth;
        const inEnd = start + sliceWidth * 0.32;
        const outStart = end - sliceWidth * 0.32;
        return { start, inEnd, outStart, end };
    });

    const update = () => {
        ticking = false;

        const rect = wrap.getBoundingClientRect();
        const scrollable = wrap.offsetHeight - window.innerHeight;
        if (scrollable <= 0) return;

        const progress = clamp(-rect.top / scrollable, 0, 1);

        words.forEach((el, i) => {
            const slice = wordSlices[i];
            let opacity, scale, blur, y;

            if (progress < slice.start || progress > slice.end) {
                opacity = 0; scale = 0.82; blur = 10; y = 18;
            } else if (progress < slice.inEnd) {
                const t = mapRange(progress, slice.start, slice.inEnd, 0, 1);
                opacity = t;
                scale = 0.82 + 0.18 * t;
                blur = 10 * (1 - t);
                y = 18 * (1 - t);
            } else if (progress < slice.outStart) {
                opacity = 1; scale = 1; blur = 0; y = 0;
            } else {
                const t2 = mapRange(progress, slice.outStart, slice.end, 0, 1);
                opacity = 1 - t2;
                scale = 1 - 0.1 * t2;
                blur = 8 * t2;
                y = -14 * t2;
            }

            el.style.opacity = opacity;
            el.style.filter = `blur(${blur.toFixed(1)}px)`;
            el.style.transform = `translate(-50%, calc(-50% + ${y.toFixed(1)}px)) scale(${scale.toFixed(3)})`;
        });

        const contentOpacity = mapRange(progress, CONTENT_PHASE_START, CAROUSEL_PHASE_START, 0, 1);
        const contentY = mapRange(progress, CONTENT_PHASE_START, CAROUSEL_PHASE_START, 46, 0);
        const contentBlur = mapRange(progress, CONTENT_PHASE_START, CAROUSEL_PHASE_START, 8, 0);

        content.style.opacity = contentOpacity;
        content.style.filter = `blur(${contentBlur.toFixed(1)}px)`;
        content.style.transform = `translateY(${contentY.toFixed(1)}px)`;
        content.style.pointerEvents = contentOpacity > 0.6 ? 'auto' : 'none';

        if (carouselRoot) {
            const carouselInstance = carouselRoot.__arcCarouselInstance;
            if (carouselInstance && typeof carouselInstance.setProgress === 'function') {
                const carouselT = mapRange(progress, CAROUSEL_PHASE_START, 1, 0, 1);
                carouselInstance.setProgress(carouselT);
            }
        }
    };

    const onScroll = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => onScroll()).observe(wrap);
    }

    update();
})();