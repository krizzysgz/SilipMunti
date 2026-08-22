<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$profileStmt = $pdo->prepare("
    SELECT profile_picture
    FROM users
    WHERE id = :user_id
        AND deleted_at IS NULL
    LIMIT 1
");

$profileStmt->execute([
    'user_id' => $user['id']
]);

$profile = $profileStmt->fetch();

if (!$profile) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'User profile not found.'
    ]);
    exit;
}

if (!$profile['profile_picture']) {
    echo json_encode([
        'success' => true,
        'message' => 'Profile picture is already empty.'
    ]);
    exit;
}

$updateStmt = $pdo->prepare("
    UPDATE users
    SET profile_picture = NULL
    WHERE id = :user_id
        AND deleted_at IS NULL
");

$updateStmt->execute([
    'user_id' => $user['id']
]);

if (
    str_starts_with(
        $profile['profile_picture'],
        'storage/profile-pictures/'
    )
) {
    $filePath = dirname(__DIR__) . '/' . $profile['profile_picture'];

    if (is_file($filePath)) {
        unlink($filePath);
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Profile picture removed successfully.'
]);