<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';

$email = 'admin@silipmunti.com';
$password = 'password123';
$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare("
    UPDATE users
    SET
        password = :password,
        role = 'admin',
        deleted_at = NULL
    WHERE email = :email
");

$stmt->execute([
    'password' => $hash,
    'email' => $email
]);

echo json_encode([
    'success' => true,
    'message' => 'Admin password updated.',
    'email' => $email,
    'password' => $password,
    'rows_updated' => $stmt->rowCount()
]);