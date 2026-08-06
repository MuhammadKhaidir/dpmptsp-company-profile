// server.js
// Entry point. Menyajikan folder public/ (frontend) dan mount semua route API dari web.js.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const apiRoutes = require('./web');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/assets', express.static(path.join(__dirname, 'Assets')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dpmptsp-ganti-secret-ini',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 } // sesi berlaku 2 jam
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

const qrImagesRouter = require('./routes/qrImages');
   app.use('/api/qr-images', qrImagesRouter);

   const qrBgRouter = require('./routes/qrBg');
app.use('/api/qr-bg', qrBgRouter);

   const musicRouter = require('./routes/music');
app.use('/api/music', musicRouter);

const mapRouter = require('./routes/map');
app.use('/api/map', mapRouter);

const flipbookContentRouter = require('./routes/flipbookContent');
app.use('/api/flipbook', flipbookContentRouter);

const arcCarouselRouter = require('./routes/arcCarouselContent');
   app.use('/api/arc-carousel', arcCarouselRouter);

   app.use('/api/qr-doc', require('./routes/qrDoc'));


// Semua route non-API jatuh ke index.html — routing halaman (login/dashboard/dll)
// ditangani di sisi client oleh Alpine.js (public/js/App.js), bukan server.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server.js] DPMPTSP berjalan di http://localhost:${PORT}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[server.js] ⚠️  OPENROUTER_API_KEY belum diset di .env — AI chat belum akan berfungsi sampai diisi.');
  }
});