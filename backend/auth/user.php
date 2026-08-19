<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);

    echo json_encode([
        'success' => false,
        'message' => 'You are not logged in.'
    ]);

    exit;
}

try {
    $getUser = $pdo->prepare(
        'SELECT
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            profile_picture,
            created_at
         FROM users
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getUser->execute([$_SESSION['user_id']]);

    $user = $getUser->fetch();

    if (!$user) {
        $_SESSION = [];
        session_destroy();

        http_response_code(401);

        echo json_encode([
            'success' => false,
            'message' => 'User account is no longer available.'
        ]);

        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Authenticated user retrieved successfully.',
        'data' => [
            'user' => $user
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve user information.'
    ]);
}