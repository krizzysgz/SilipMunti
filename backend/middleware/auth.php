<?php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';
require_once __DIR__ . '/../config/landlord-verification.php';
require_once __DIR__ . '/../security/csrf.php';

function authentication_error(string $message, int $status, array $data = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    $response = [
        'success' => false,
        'message' => $message
    ];

    if ($data !== []) {
        $response['data'] = $data;
    }

    echo json_encode($response);
    exit;
}

function clear_user_session(): void
{
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
                'samesite' => $cookie['samesite'] ?? 'Lax'
            ]
        );
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}

function current_user(PDO $pdo): ?array
{
    $userId = $_SESSION['user_id'] ?? null;

    if (
        !is_int($userId)
        && !ctype_digit((string) $userId)
    ) {
        return null;
    }

    $getUser = $pdo->prepare("
        SELECT
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            landlord_status,
            landlord_reviewed_at,
            landlord_rejection_reason,
            profile_picture,
            created_at
        FROM users
        WHERE id = :user_id
            AND deleted_at IS NULL
        LIMIT 1
    ");

    $getUser->execute([
        'user_id' => (int) $userId
    ]);

    $user = $getUser->fetch();

    if (!$user) {
        clear_user_session();
        return null;
    }

    $user['id'] = (int) $user['id'];

    if ($user['role'] === 'landlord') {
        $verification = get_landlord_verification_summary(
            $pdo,
            $user['id'],
            $user['landlord_status']
        );

        $user = array_merge($user, $verification);
    } else {
        $user['account_status'] = 'active';
        $user['verification_level'] = null;
        $user['approved_document_count'] = 0;
        $user['approved_documents'] = [];
        $user['missing_documents'] = [];
        $user['is_fully_verified'] = false;
    }

    return $user;
}

function require_login(PDO $pdo): array
{
    $user = current_user($pdo);

    if (!$user) {
        authentication_error(
            'You must log in first.',
            401
        );
    }

    require_csrf_token();

    return $user;
}

function require_role(PDO $pdo, array $allowedRoles): array
{
    $user = require_login($pdo);

    if (!in_array($user['role'], $allowedRoles, true)) {
        authentication_error(
            'You do not have permission to perform this action.',
            403
        );
    }

    return $user;
}

function require_approved_landlord(PDO $pdo): array
{
    $landlord = require_role($pdo, ['landlord']);

    if (($landlord['account_status'] ?? 'pending') !== 'approved') {
        $messages = [
            'pending' =>
                'Your landlord account is awaiting admin approval.',
            'rejected' =>
                'Your landlord account was not approved.',
            'suspended' =>
                'Your landlord account is currently suspended.'
        ];

        $accountStatus = $landlord['account_status'] ?? 'pending';

        authentication_error(
            $messages[$accountStatus]
                ?? 'Admin approval is required before managing listings.',
            403,
            [
                'account_status' => $accountStatus,
                'verification_level' =>
                    $landlord['verification_level'] ?? 'unverified',
                'rejection_reason' =>
                    $landlord['landlord_rejection_reason'] ?? null
            ]
        );
    }

    return $landlord;
}

function require_verified_landlord(PDO $pdo): array
{
    return require_approved_landlord($pdo);
}
