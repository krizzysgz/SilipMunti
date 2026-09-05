<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

try {
    $user = current_user($pdo);

    echo json_encode([
        'success' => true,
        'message' => $user
            ? 'Authenticated session detected.'
            : 'Guest session detected.',
        'data' => [
            'authenticated' => $user !== null,
            'user' => $user
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to check the current session.'
    ]);
}
