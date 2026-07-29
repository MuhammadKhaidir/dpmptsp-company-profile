// config/database.js
// Pool koneksi MySQL, dipakai oleh routes/auth.js (dan nanti routes lain kayak pengaduan)

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dpmptsp_pengaduan',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;