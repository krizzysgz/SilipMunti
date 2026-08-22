<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$stmt = $pdo->prepare("
    SELECT
        id,
        first_name,
        last_name,
        email,
        phone_number,
        role,
        profile_picture,
        created_at
    FROM users
    WHERE id = :user_id
        AND deleted_at IS NULL
    LIMIT 1
");

$stmt->execute([
    'user_id' => $user['id']
]);

$profile = $stmt->fetch();

if (!$profile) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'User profile not found.'
    ]);
    exit;
}

$profile['profile_picture_url'] = $profile['profile_picture']
    ? '/SilipMunti/backend/' . $profile['profile_picture']
    : null;

echo json_encode([
    'success' => true,
    'message' => 'Profile retrieved successfully.',
    'data' => [
        'profile' => $profile
    ]
]);