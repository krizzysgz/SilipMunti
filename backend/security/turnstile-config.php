<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/turnstile.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

try {
    $enabled = turnstile_is_enabled();

    echo json_encode([
        'success' => true,
        'data' => [
            'enabled' => $enabled,
            'site_key' => $enabled
                ? turnstile_site_key()
                : null
        ]
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(503);

    echo json_encode([
        'success' => false,
        'message' =>
            'Security verification is temporarily unavailable.'
    ]);
}
