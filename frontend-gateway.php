<?php
declare(strict_types=1);

define('SM_FRONTEND_GATEWAY', true);
require_once __DIR__ . '/backend/system/core.php';
require_once __DIR__ . '/backend/config/public-url.php';

try {
    $uri = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH));
    $prefix = rawurldecode(sm_public_url('frontend/'));
    if (!str_starts_with($uri, $prefix) || str_contains($uri, "\0") || str_contains($uri, '\\')) {
        http_response_code(404);
        exit;
    }

    $page = substr($uri, strlen($prefix));
    if ($page === '' || str_ends_with($page, '/')) {
        $page .= 'index.html';
    }

    // Keep the previous maintenance bookmark working.
    if ($page === 'maintenance.html') {
        header('Cache-Control: no-store');
        header('Location: ' . sm_public_url('frontend/index.html'), true, 303);
        exit;
    }

    $base = realpath(__DIR__ . '/frontend');
    $target = $base === false ? false : realpath($base . '/' . $page);
    if ($target === false || !str_starts_with($target, $base . DIRECTORY_SEPARATOR)
        || !is_file($target) || strtolower(pathinfo($target, PATHINFO_EXTENSION)) !== 'html') {
        $errorStatus = 404;
        require __DIR__ . '/backend/error.php';
        exit;
    }

    sm_request_lock(true);
    if (sm_state()['enabled'] && $page !== 'pages/auth/admin-login.html') {
        require_once __DIR__ . '/backend/config/session.php';
        if (empty($_SESSION['user_id']) || !isset($_SESSION['session_version'])) {
            sm_unavailable(true);
        }
        require_once __DIR__ . '/backend/config/database.php';
        if (!sm_is_admin($pdo)) {
            sm_unavailable(true);
        }
    }

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    readfile($target);
} catch (Throwable $e) {
    error_log('Frontend gateway: ' . $e->getMessage());
    sm_unavailable(true, 'SilipMunti is temporarily unavailable. Please try again shortly.');
}
