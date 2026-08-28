<?php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';

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

function require_login(PDO $pdo): array
{
    $userId = $_SESSION['user_id'] ?? null;

    if (
        !is_int($userId)
        && !ctype_digit((string) $userId)
    ) {
        authentication_error(
            'You must log in first.',
            401
        );
    }

    $getUser = $pdo->prepare("
        SELECT
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            profile_picture
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

        authentication_error(
            'User account is no longer available.',
            401
        );
    }

    $user['id'] = (int) $user['id'];

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

function require_verified_landlord(PDO $pdo): array
{
    $landlord = require_role($pdo, ['landlord']);

    $requiredDocuments = [
        'valid_id',
        'barangay_clearance',
        'land_title'
    ];

    $documentStmt = $pdo->prepare("
        SELECT DISTINCT document_type
        FROM verification_documents
        WHERE landlord_id = :landlord_id
            AND verification_status = 'approved'
            AND deleted_at IS NULL
    ");

    $documentStmt->execute([
        'landlord_id' => $landlord['id']
    ]);

    $approvedDocuments = $documentStmt->fetchAll(PDO::FETCH_COLUMN);

    $missingDocuments = array_values(
        array_diff($requiredDocuments, $approvedDocuments)
    );

    if ($missingDocuments !== []) {
        authentication_error(
            'Complete landlord verification is required before managing listings.',
            403,
            [
                'verified' => false,
                'approved_documents' => $approvedDocuments,
                'missing_documents' => $missingDocuments
            ]
        );
    }

    $landlord['is_verified_landlord'] = true;

    return $landlord;
}