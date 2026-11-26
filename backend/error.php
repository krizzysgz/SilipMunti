<?php

require_once __DIR__ . '/config/error-pages.php';

$redirectStatus = filter_var($_SERVER['REDIRECT_STATUS'] ?? null, FILTER_VALIDATE_INT);
$value = $redirectStatus !== false && $redirectStatus >= 400 && $redirectStatus <= 599
    ? $redirectStatus
    : ($_GET['status'] ?? 500);
$status = filter_var($value, FILTER_VALIDATE_INT);
if ($status === false || $status < 400 || $status > 599) {
    $status = 500;
}
http_response_code($status);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($status === 503) {
    header('Retry-After: 60');
}
if (silip_error_is_document_request()) {
    silip_error_html_headers();
    echo silip_error_html($status);
} else {
    [$title, $description] = silip_error_details($status);
    $isMaintenance = $status === 503 && $title === 'Maintenance Mode';
    header('Content-Type: application/json; charset=utf-8');
    $response = [
        'success' => false,
        'message' => $isMaintenance ? $description : $title
    ];
    if ($isMaintenance) {
        $response['code'] = 'maintenance_mode';
    }
    echo json_encode($response, JSON_INVALID_UTF8_SUBSTITUTE);
}
