// middleware/requireAdmin.js
//
// Gerbang admin untuk SEMUA route yang mengubah/menghapus konten (ganti
// gambar QR, latar belakang, dokumen terkait, isi carousel, flip book,
// peta, musik, dst). Dipasang di depan handler POST/PUT/DELETE yang
// relevan di masing-masing router.
//
// Menggantikan model lama (password dikirim ulang tiap aksi lewat form
// modal) dengan sesi login sesungguhnya: admin login SEKALI lewat
// /api/auth/login (routes/auth.js, sudah ada), sesi tersimpan di cookie
// (express-session, sudah di-mount di server.js sebelum semua route),
// middleware ini tinggal baca req.session.role.

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            message: 'Anda harus login untuk melakukan tindakan ini.'
        });
    }
    if (req.session.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Hanya admin yang dapat melakukan tindakan ini.'
        });
    }
    next();
}

module.exports = requireAdmin;