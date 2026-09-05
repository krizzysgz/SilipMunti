<?php

require_once __DIR__ . '/../config/session.php';

function csrf_token_lifetime(): int
{
    return 1800;
}

function csrf_generate_token(): string
{
    return bin2hex(random_bytes(32));
}

function csrf_get_token(bool $forceRotation = false): string
{
    $currentToken = $_SESSION['csrf_token'] ?? null;
    $createdAt = (int) ($_SESSION['csrf_token_created_at'] ?? 0);
    $tokenExpired =
        $createdAt <= 0
        || time() - $createdAt >= csrf_token_lifetime();

    $tokenInvalid =
        !is_string($currentToken)
        || preg_match('/^[a-f0-9]{64}$/', $currentToken) !== 1;

    if ($forceRotation || $tokenInvalid || $tokenExpired) {
        $currentToken = csrf_generate_token();
        $_SESSION['csrf_token'] = $currentToken;
        $_SESSION['csrf_token_created_at'] = time();
    }

    return $currentToken;
}

function csrf_rotate_token(): string
{
    return csrf_get_token(true);
}

function csrf_clear_token(): void
{
    unset(
        $_SESSION['csrf_token'],
        $_SESSION['csrf_token_created_at']
    );
}

function csrf_request_token(): string
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

    return is_string($token) ? trim($token) : '';
}

function csrf_token_is_valid(string $requestToken): bool
{
    if (preg_match('/^[a-f0-9]{64}$/', $requestToken) !== 1) {
        return false;
    }

    $sessionToken = $_SESSION['csrf_token'] ?? null;
    $createdAt = (int) ($_SESSION['csrf_token_created_at'] ?? 0);

    if (
        !is_string($sessionToken)
        || preg_match('/^[a-f0-9]{64}$/', $sessionToken) !== 1
        || $createdAt <= 0
        || time() - $createdAt >= csrf_token_lifetime()
    ) {
        return false;
    }

    return hash_equals($sessionToken, $requestToken);
}

function csrf_error_response(): never
{
    http_response_code(419);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');

    echo json_encode([
        'success' => false,
        'message' =>
            'Your security token is missing or expired. '
            . 'Refresh the page and try again.',
        'code' => 'csrf_token_mismatch'
    ]);

    exit;
}

function require_csrf_token(): void
{
    $method = strtoupper(
        (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')
    );

    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }

    if (!csrf_token_is_valid(csrf_request_token())) {
        csrf_error_response();
    }
}
