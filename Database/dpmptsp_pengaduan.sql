-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jul 03, 2026 at 03:14 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `dpmptsp_pengaduan`
--

-- --------------------------------------------------------

--
-- Table structure for table `dokumen_penyelesaian`
--

CREATE TABLE `dokumen_penyelesaian` (
  `id` int(10) UNSIGNED NOT NULL,
  `pengaduan_id` int(10) UNSIGNED NOT NULL,
  `admin_id` int(10) UNSIGNED NOT NULL,
  `file_surat` varchar(255) NOT NULL,
  `catatan` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `kategori_pengaduan`
--

CREATE TABLE `kategori_pengaduan` (
  `id` int(10) UNSIGNED NOT NULL,
  `nama_kategori` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `kategori_pengaduan`
--

INSERT INTO `kategori_pengaduan` (`id`, `nama_kategori`) VALUES
(1, 'Pelayanan'),
(2, 'Perizinan'),
(3, 'Website / OSS'),
(4, 'Sarana dan Prasarana');

-- --------------------------------------------------------

--
-- Table structure for table `pengaduan`
--

CREATE TABLE `pengaduan` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `kategori_id` int(10) UNSIGNED NOT NULL,
  `judul` varchar(255) NOT NULL,
  `deskripsi` text NOT NULL,
  `lampiran` varchar(255) DEFAULT NULL,
  `status` enum('menunggu_verifikasi','ditolak','diproses_admin','verifikasi_akhir','selesai') NOT NULL DEFAULT 'menunggu_verifikasi',
  `petugas_id` int(10) UNSIGNED DEFAULT NULL,
  `admin_id` int(10) UNSIGNED DEFAULT NULL,
  `alasan_penolakan` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `pengaduan`
--

INSERT INTO `pengaduan` (`id`, `user_id`, `kategori_id`, `judul`, `deskripsi`, `lampiran`, `status`, `petugas_id`, `admin_id`, `alasan_penolakan`, `created_at`, `updated_at`) VALUES
(1, 1, 2, 'Pungutan Liar Oknum Loket B Perizinan Ruko', 'Pada tanggal 15 Juni 2026 pukul 10:30 WIB, saya mengantre di Loket B untuk menyerahkan berkas validasi IMB. Oknum petugas meminta biaya tambahan sebesar Rp200.000 tanpa kuitansi resmi.', NULL, 'diproses_admin', 3, NULL, NULL, '2026-07-03 01:04:31', '2026-07-03 01:04:31'),
(2, 1, 3, 'Sistem Cetak Berkas OSS Sering Down Jam Kerja', 'Sistem cetak berkas OSS sering down setiap jam kerja sehingga menghambat proses pengambilan dokumen.', NULL, 'selesai', 3, NULL, NULL, '2026-07-03 01:04:31', '2026-07-03 01:04:31');

-- --------------------------------------------------------

--
-- Table structure for table `riwayat_pengaduan`
--

CREATE TABLE `riwayat_pengaduan` (
  `id` int(10) UNSIGNED NOT NULL,
  `pengaduan_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `aksi` varchar(100) NOT NULL,
  `keterangan` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `riwayat_pengaduan`
--

INSERT INTO `riwayat_pengaduan` (`id`, `pengaduan_id`, `user_id`, `aksi`, `keterangan`, `created_at`) VALUES
(1, 1, 1, 'Pengaduan Dibuat', 'Laporan dikirim oleh masyarakat melalui form pengaduan.', '2026-07-03 01:04:31'),
(2, 1, 3, 'Diterima Petugas', 'Laporan diterima oleh petugas, berkas diserahkan untuk investigasi CCTV loket.', '2026-07-03 01:04:31'),
(3, 1, 3, 'Diteruskan ke Admin', 'Kasus valid, diteruskan ke admin untuk ditindaklanjuti.', '2026-07-03 01:04:31');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `nik` varchar(16) DEFAULT NULL,
  `nama_lengkap` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `no_hp` varchar(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('masyarakat','petugas','admin') NOT NULL DEFAULT 'masyarakat',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `nik`, `nama_lengkap`, `email`, `no_hp`, `password`, `role`, `created_at`, `updated_at`) VALUES
(1, '1671020304050001', 'Ahmad Subarjo', 'ahmad.subarjo@mail.com', '081234567890', '$2y$10$ganticontohhashinidenganpasswordhashphp', 'masyarakat', '2026-07-03 01:04:31', '2026-07-03 01:04:31'),
(2, '1671020304050002', 'Siti Aminah', 'siti.aminah@mail.com', '081298765432', '$2y$10$ganticontohhashinidenganpasswordhashphp', 'masyarakat', '2026-07-03 01:04:31', '2026-07-03 01:04:31'),
(3, NULL, 'Pratama Wijaya', 'pratama.petugas@dpmptsp.go.id', '081211112222', '$2y$10$ganticontohhashinidenganpasswordhashphp', 'petugas', '2026-07-03 01:04:31', '2026-07-03 01:04:31'),
(4, NULL, 'Rina Kusuma', 'rina.admin@dpmptsp.go.id', '081233334444', '$2y$10$ganticontohhashinidenganpasswordhashphp', 'admin', '2026-07-03 01:04:31', '2026-07-03 01:04:31');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `dokumen_penyelesaian`
--
ALTER TABLE `dokumen_penyelesaian`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_dokumen_pengaduan` (`pengaduan_id`),
  ADD KEY `fk_dokumen_admin` (`admin_id`);

--
-- Indexes for table `kategori_pengaduan`
--
ALTER TABLE `kategori_pengaduan`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `pengaduan`
--
ALTER TABLE `pengaduan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_pengaduan_kategori` (`kategori_id`),
  ADD KEY `fk_pengaduan_petugas` (`petugas_id`),
  ADD KEY `fk_pengaduan_admin` (`admin_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indexes for table `riwayat_pengaduan`
--
ALTER TABLE `riwayat_pengaduan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_riwayat_pengaduan` (`pengaduan_id`),
  ADD KEY `fk_riwayat_user` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `nik` (`nik`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `dokumen_penyelesaian`
--
ALTER TABLE `dokumen_penyelesaian`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `kategori_pengaduan`
--
ALTER TABLE `kategori_pengaduan`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `pengaduan`
--
ALTER TABLE `pengaduan`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `riwayat_pengaduan`
--
ALTER TABLE `riwayat_pengaduan`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `dokumen_penyelesaian`
--
ALTER TABLE `dokumen_penyelesaian`
  ADD CONSTRAINT `fk_dokumen_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_dokumen_pengaduan` FOREIGN KEY (`pengaduan_id`) REFERENCES `pengaduan` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `pengaduan`
--
ALTER TABLE `pengaduan`
  ADD CONSTRAINT `fk_pengaduan_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pengaduan_kategori` FOREIGN KEY (`kategori_id`) REFERENCES `kategori_pengaduan` (`id`),
  ADD CONSTRAINT `fk_pengaduan_petugas` FOREIGN KEY (`petugas_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pengaduan_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `riwayat_pengaduan`
--
ALTER TABLE `riwayat_pengaduan`
  ADD CONSTRAINT `fk_riwayat_pengaduan` FOREIGN KEY (`pengaduan_id`) REFERENCES `pengaduan` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_riwayat_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
