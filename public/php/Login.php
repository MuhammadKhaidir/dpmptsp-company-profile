<?php
// auth/login.php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$input    = json_decode(file_get_contents('php://input'), true);
$email    = trim($input['email'] ?? '');
$password = $input['password'] ?? '';

if ($email === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Email/NIK dan kata sandi wajib diisi']);
    exit;
}

// Login bisa pakai email ATAU NIK, sesuai label form ("Email / NIK")
$stmt = $pdo->prepare("SELECT id, nama_lengkap, password, role FROM users WHERE email = :val OR nik = :val LIMIT 1");
$stmt->execute(['val' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password'])) {
    echo json_encode(['success' => false, 'message' => 'Email/NIK atau kata sandi salah']);
    exit;
}

$_SESSION['user_id']      = $user['id'];
$_SESSION['nama_lengkap'] = $user['nama_lengkap'];
$_SESSION['role']         = $user['role'];

echo json_encode([
    'success'      => true,
    'role'         => $user['role'],
    'nama_lengkap' => $user['nama_lengkap']
]);