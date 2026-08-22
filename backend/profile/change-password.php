<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$currentPassword = $data['current_password'] ?? '';
$newPassword = $data['new_password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';

if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'All password fields are required.'
    ]);
    exit;
}

if (strlen($newPassword) < 8) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password must contain at least 8 characters.'
    ]);
    exit;
}

if ($newPassword !== $confirmPassword) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password and confirmation do not match.'
    ]);
    exit;
}

$passwordStmt = $pdo->prepare("
    SELECT password
    FROM users
    WHERE id = :user_id
        AND deleted_at IS NULL
    LIMIT 1
");

$passwordStmt->execute([
    'user_id' => $user['id']
]);

$account = $passwordStmt->fetch();

if (!$account || !password_verify($currentPassword, $account['password'])) {
    http_response_code(401);

    echo json_encode([
        'success' => false,
        'message' => 'Current password is incorrect.'
    ]);
    exit;
}

if (password_verify($newPassword, $account['password'])) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password must be different from the current password.'
    ]);
    exit;
}

$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);

$updateStmt = $pdo->prepare("
    UPDATE users
    SET password = :password
    WHERE id = :user_id
        AND deleted_at IS NULL
");

$updateStmt->execute([
    'password' => $hashedPassword,
    'user_id' => $user['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'Password changed successfully.'
]);