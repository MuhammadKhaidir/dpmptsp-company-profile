// middleware/requireAdmin.js
//
// Gerbang admin untuk SEMUA route yang mengubah/menghapus konten.
//
// SEMENTARA: ditambah console.log diagnostik di setiap titik keputusan,
// buat nangkep KENAPA persis suatu request ditolak -- ada laporan
// GET /api/auth/check-session bilang admin, tapi POST ke endpoint yang
// dilindungi requireAdmin balik 401 beberapa detik kemudian. Logging ini
// bakal nunjukin: apakah req.sessionID beda-beda antar request (cookie
// gak konsisten kekirim), atau req.session ada tapi user_id/role-nya
// kosong (session ke-load tapi datanya gak lengkap/gak ketemu di store).
// Cabut console.log ini lagi begitu akar masalahnya ketemu.

function requireAdmin(req, res, next) {
    console.log('[requireAdmin]', {
        path: req.path,
        method: req.method,
        sessionID: req.sessionID,
        hasSession: !!req.session,
        user_id: req.session ? req.session.user_id : undefined,
        role: req.session ? req.session.role : undefined,
        cookieHeaderPresent: !!req.headers.cookie,
        cookieHeaderRaw: req.headers.cookie || null
    });

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