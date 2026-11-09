<?php

require_once __DIR__ . '/config/error-pages.php';

$value = $_SERVER['REDIRECT_STATUS']
    ?? $_GET['status']
    ?? 500;

$status = filter_var($value, FILTER_VALIDATE_INT);

if (
    $status === false
    || $status < 400
    || $status > 599
) {
    $status = 500;
}

http_response_code($status);

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (silip_error_is_document_request()) {
    silip_error_html_headers();

    echo silip_error_html($status);
} else {
    [$message] = silip_error_details($status);

    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
}