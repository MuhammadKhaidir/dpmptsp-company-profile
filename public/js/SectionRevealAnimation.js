
(function () {
    if (!('IntersectionObserver' in window)) {
        // Fallback: just show everything immediately.
        document.querySelectorAll('[data-reveal]').forEach(function (el) {
            el.classList.add('is-visible');
        });
        document.querySelectorAll('.info-wipe-layer').forEach(function (el) {
            el.classList.add('run');
        });
        return;
    }

    var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

    var wipeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('run');
                wipeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[data-reveal]').forEach(function (el) {
            revealObserver.observe(el);
        });
        document.querySelectorAll('.info-wipe-layer').forEach(function (el) {
            wipeObserver.observe(el);
        });
    });
})();