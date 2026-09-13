// NavDropdown.js
// Toggle buat dropdown menu "Informasi" & "Investasi" di navbar (.nav-dropdown).
// Hover tetap jalan lewat CSS (:hover), script ini nambahin dukungan tap/klik
// buat mobile, soalnya touchscreen gak punya event hover yang reliable.

document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
    const toggle = dropdown.querySelector('.dropdown-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');

        // tutup dropdown lain yang lagi kebuka, biar gak numpuk dua-duanya
        document.querySelectorAll('.nav-dropdown.open').forEach((d) => {
            if (d !== dropdown) d.classList.remove('open');
        });

        dropdown.classList.toggle('open', !isOpen);
    });
});

// klik di luar navbar -> tutup semua dropdown yang lagi kebuka
document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach((d) => d.classList.remove('open'));
});

// tekan Escape -> tutup semua dropdown (aksesibilitas keyboard)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.nav-dropdown.open').forEach((d) => d.classList.remove('open'));
    }
});