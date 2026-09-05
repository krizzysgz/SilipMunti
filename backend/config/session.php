<?php

if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

require_once __DIR__ . '/env.php';

function session_environment_flag(?string $value): bool
{
    return in_array(
        strtolower(trim((string) $value)),
        ['1', 'true', 'yes', 'on'],
        true
    );
}

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.gc_maxlifetime', '43200');

$appEnvironment = strtolower(
    env_value('APP_ENV', 'local') ?? 'local'
);

$trustProxyHeaders = session_environment_flag(
    env_value('TRUST_PROXY_HEADERS', 'false')
);

$forwardedProto = strtolower(trim(
    explode(
        ',',
        (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')
    )[0]
));

$isDirectHttps = (
    isset($_SERVER['HTTPS'])
    && strtolower((string) $_SERVER['HTTPS']) === 'on'
) || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;

$isHttps =
    $isDirectHttps
    || ($trustProxyHeaders && $forwardedProto === 'https');

$secureCookie =
    $isHttps
    || $appEnvironment === 'production';

session_name('silip_munti_session');

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_start();

$idleTimeout = 7200;
$absoluteTimeout = 43200;
$regenerationInterval = 900;
$currentTime = time();
$sessionStartedAt = (int) (
    $_SESSION['session_started_at'] ?? 0
);

$idleExpired =
    isset($_SESSION['last_activity'])
    && $currentTime - (int) $_SESSION['last_activity'] > $idleTimeout;

$absoluteExpired =
    $sessionStartedAt > 0
    && $currentTime - $sessionStartedAt > $absoluteTimeout;

if ($idleExpired || $absoluteExpired) {
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
    if ($sessionStartedAt <= 0) {
        $_SESSION['session_started_at'] = $currentTime;
    }

    $_SESSION['last_activity'] = $currentTime;

    $lastRegeneration = (int) (
        $_SESSION['last_regeneration'] ?? 0
    );

    if (
        $lastRegeneration <= 0
        || $currentTime - $lastRegeneration >= $regenerationInterval
    ) {
        session_regenerate_id(true);
        $_SESSION['last_regeneration'] = $currentTime;
    }
}
