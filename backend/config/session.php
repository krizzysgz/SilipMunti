<?php

if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');

$isHttps = isset($_SERVER['HTTPS'])
    && strtolower($_SERVER['HTTPS']) === 'on';

session_name('silip_munti_session');

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_start();

$idleTimeout = 7200;
$currentTime = time();

if (
    isset($_SESSION['last_activity'])
    && $currentTime - $_SESSION['last_activity'] > $idleTimeout
) {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $cookie = session_get_cookie_params();

        setcookie(
            session_name(),
            '',
            [
                'expires' => time() - 42000,
                'path' => $cookie['path'],
                'domain' => $cookie['domain'],
                'secure' => $cookie['secure'],
                'httponly' => $cookie['httponly'],
                'samesite' => $cookie['samesite']
            ]
        );
    }

    session_destroy();
} else {
    $_SESSION['last_activity'] = $currentTime;
}