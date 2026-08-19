<?php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';

function authentication_error(string $message, int $status): never
{
    http_response_code($status);

    echo json_encode([
        'success' => false,
        'message' => $message
    ]);

    exit;
}

function require_login(PDO $pdo): array
{
    if (!isset($_SESSION['user_id'])) {
        authentication_error('You must log in first.', 401);
    }

    $getUser = $pdo->prepare(
        'SELECT
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            profile_picture
         FROM users
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getUser->execute([$_SESSION['user_id']]);

    $user = $getUser->fetch();

    if (!$user) {
        $_SESSION = [];
        session_destroy();

        authentication_error(
            'User account is no longer available.',
            401
        );
    }

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