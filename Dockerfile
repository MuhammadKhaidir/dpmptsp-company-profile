# Image dasar: Node.js LTS, varian "slim" biar image kecil & build cepat.
FROM node:20-slim

WORKDIR /app

# Copy manifest dulu doang -- biar layer "npm ci" di-cache Docker dan gak
# keinstall ulang tiap kali cuma ngubah kode (bukan dependency).
COPY package*.json ./
RUN npm ci --omit=dev

# Baru copy semua source code.
COPY . .

# Kalau server.js kamu baca process.env.PORT (pola umum:
# "const PORT = process.env.PORT || 3000"), baris ini otomatis kepake.
# Kalau server.js kamu hardcode port lain, GAK PERLU diubah di sini --
# yang penting internal_port di fly.toml disamain manual.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]