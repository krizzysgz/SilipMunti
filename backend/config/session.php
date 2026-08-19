<?php

if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';

session_name('silip_munti_session');

session_set_cookie_params([
    'lifetime' => 86400,
    'path' => '/',
    'domain' => '',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_start();