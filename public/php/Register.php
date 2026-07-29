<?php
// auth/register.php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$input        = json_decode(file_get_contents('php://input'), true);
$nama_lengkap = trim($input['nama_lengkap'] ?? '');
$nik          = trim($input['nik'] ?? '');
$no_hp        = trim($input['no_hp'] ?? '');
$email        = trim($input['email'] ?? '');
$password     = $input['password'] ?? '';

if ($nama_lengkap === '' || $nik === '' || $no_hp === '' || $email === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Semua kolom wajib diisi']);
    exit;
}

if (strlen($nik) !== 16 || !ctype_digit($nik)) {
    echo json_encode(['success' => false, 'message' => 'NIK harus 16 digit angka']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Format email tidak valid']);
    exit;
}

if (strlen($password) < 8) {
    echo json_encode(['success' => false, 'message' => 'Kata sandi minimal 8 karakter']);
    exit;
}

$cek = $pdo->prepare("SELECT id FROM users WHERE email = :email OR nik = :nik");
$cek->execute(['email' => $email, 'nik' => $nik]);
if ($cek->fetch()) {
    echo json_encode(['success' => false, 'message' => 'Email atau NIK sudah terdaftar']);
    exit;
}

$hash = password_hash($password, PASSWORD_BCRYPT);

$stmt = $pdo->prepare(
    "INSERT INTO users (nik, nama_lengkap, email, no_hp, password, role)
     VALUES (:nik, :nama, :email, :no_hp, :password, 'masyarakat')"
);
$stmt->execute([
    'nik'      => $nik,
    'nama'     => $nama_lengkap,
    'email'    => $email,
    'no_hp'    => $no_hp,
    'password' => $hash
]);

echo json_encode(['success' => true, 'message' => 'Registrasi berhasil, silakan login']);