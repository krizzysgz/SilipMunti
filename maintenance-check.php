<?php

require_once __DIR__ . '/backend/system/core.php';
require_once __DIR__ . '/backend/config/public-url.php';

$message = 'Maintenance display test.';

if (($_GET['status'] ?? '') === '503') {
    sm_unavailable(true, $message);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

$template = __DIR__ . '/frontend/maintenance.html';

if (!is_readable($template)) {
    exit('Maintenance template is missing or unreadable.');
}

$html = file_get_contents($template);
$frontendBase = htmlspecialchars(sm_public_url('frontend/'), ENT_QUOTES, 'UTF-8');
echo strtr($html, [
    '<head>' => '<head><base href="' . $frontendBase . '">',
    '{{SM_MAINTENANCE_MESSAGE}}' => htmlspecialchars($message, ENT_QUOTES, 'UTF-8'),
]);