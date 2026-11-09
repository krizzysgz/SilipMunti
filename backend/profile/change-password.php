<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$currentPassword = is_string($data['current_password'] ?? null)
    ? $data['current_password']
    : '';

$newPassword = is_string($data['new_password'] ?? null)
    ? $data['new_password']
    : '';

$confirmPassword = is_string($data['confirm_password'] ?? null)
    ? $data['confirm_password']
    : '';

if (
    $currentPassword === ''
    || $newPassword === ''
    || $confirmPassword === ''
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'All password fields are required.'
    ]);
    exit;
}

if (strlen($newPassword) < 8) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password must contain at least 8 characters.'
    ]);
    exit;
}

if (strlen($newPassword) > 255) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password is too long.',
        'errors' => [
            'new_password' => 'New password is too long.'
        ]
    ]);
    exit;
}

if (
    !preg_match('/[A-Z]/', $newPassword)
    || !preg_match('/[a-z]/', $newPassword)
    || !preg_match('/[0-9]/', $newPassword)
    || !preg_match('/[\W_]/', $newPassword)
) {
    $passwordRuleMessage =
        'Password must include at least one uppercase letter, '
        . 'one lowercase letter, one number, and one special character.';

    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => $passwordRuleMessage,
        'errors' => [
            'new_password' => $passwordRuleMessage
        ]
    ]);
    exit;
}

if ($newPassword !== $confirmPassword) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'New password and confirmation do not match.'
    ]);
    exit;
}

try {
    $passwordStmt = $pdo->prepare("
        SELECT password
        FROM users
        WHERE id = :user_id
            AND deleted_at IS NULL
        LIMIT 1
    ");

    $passwordStmt->execute([
        'user_id' => $user['id']
    ]);

    $account = $passwordStmt->fetch();

    if (
        !$account
        || !password_verify($currentPassword, $account['password'])
    ) {
        http_response_code(401);

        echo json_encode([
            'success' => false,
            'message' => 'Current password is incorrect.'
        ]);
        exit;
    }

    if (password_verify($newPassword, $account['password'])) {
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'New password must be different from the current password.'
        ]);
        exit;
    }

    $hashedPassword = password_hash(
        $newPassword,
        PASSWORD_DEFAULT
    );

    if ($hashedPassword === false) {
        throw new RuntimeException('Unable to secure the new password.');
    }

    $currentSessionVersion = (int) $_SESSION['session_version'];

    // The version condition prevents a stale session from overwriting
    // a password changed by another request.
    $updateStmt = $pdo->prepare("
        UPDATE users
        SET
            password = :password,
            session_version = session_version + 1
        WHERE id = :user_id
            AND deleted_at IS NULL
            AND session_version = :session_version
    ");

    $updateStmt->execute([
        'password' => $hashedPassword,
        'user_id' => $user['id'],
        'session_version' => $currentSessionVersion
    ]);

    if ($updateStmt->rowCount() !== 1) {
        clear_user_session();
        http_response_code(401);

        echo json_encode([
            'success' => false,
            'message' => 'Your account security changed. Please sign in again.'
        ]);
        exit;
    }

    // Preserve this browser; other sessions retain the old version.
    $_SESSION['session_version'] = $currentSessionVersion + 1;

    session_regenerate_id(true);
    $_SESSION['last_regeneration'] = time();

    csrf_rotate_token();

    echo json_encode([
        'success' => true,
        'message' => 'Password changed successfully.'
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to change the password.'
    ]);
}