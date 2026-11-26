<?php

require_once __DIR__ . '/backend/system/core.php';

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

echo str_replace(
    '{{SM_MAINTENANCE_MESSAGE}}',
    $message,
    file_get_contents($template)
);