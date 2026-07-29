<?php
// auth/check_session.php
session_start();
header('Content-Type: application/json');

if (isset($_SESSION['user_id'])) {
    echo json_encode([
        'logged_in'    => true,
        'role'         => $_SESSION['role'],
        'nama_lengkap' => $_SESSION['nama_lengkap']
    ]);
} else {
    echo json_encode(['logged_in' => false]);
}