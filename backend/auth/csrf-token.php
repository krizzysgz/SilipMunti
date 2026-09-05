<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../security/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

require_login($pdo);

echo json_encode([
    'success' => true,
    'data' => [
        'csrf_token' => csrf_get_token(),
        'expires_in' => csrf_token_lifetime()
    ]
]);
