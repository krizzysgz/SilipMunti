<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';

function password_reset_session_invalid(): never
{
    usleep(random_int(120000, 240000));

    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' =>
            'Your verification expired. Please request a new code.',
        'data' => [
            'restart' => true
        ]
    ]);

    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$data = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($data)) {
    $data = $_POST;
}

$email = strtolower(trim($data['email'] ?? ''));
$resetToken = trim((string) ($data['reset_token'] ?? ''));
$newPassword = $data['new_password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';

$errors = [];

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (strlen($email) > 254) {
    $errors['email'] = 'Email address is too long.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
}

if ($newPassword === '') {
    $errors['new_password'] = 'New password is required.';
} elseif (strlen($newPassword) < 8) {
    $errors['new_password'] =
        'New password must contain at least 8 characters.';
} elseif (strlen($newPassword) > 255) {
    $errors['new_password'] = 'New password is too long.';
} elseif (
    !preg_match('/[A-Z]/', $newPassword) ||
    !preg_match('/[a-z]/', $newPassword) ||
    !preg_match('/[0-9]/', $newPassword) ||
    !preg_match('/[\W_]/', $newPassword)
) {
    $errors['new_password'] =
        'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.';
}

if ($confirmPassword === '') {
    $errors['confirm_password'] =
        'Password confirmation is required.';
} elseif ($newPassword !== $confirmPassword) {
    $errors['confirm_password'] =
        'Passwords do not match.';
}

if ($errors !== []) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Validation failed.',
        'errors' => $errors
    ]);

    exit;
}

// Walang saysay na mag-query kung mali na ang itsura ng token.
if (!preg_match('/^[a-f0-9]{64}$/', $resetToken)) {
    password_reset_session_invalid();
}

try {
    $pdo->beginTransaction();

    $getUser = $pdo->prepare('
        SELECT
            id,
            password
        FROM users
        WHERE email = :email
            AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
    ');

    $getUser->execute([
        'email' => $email
    ]);

    $user = $getUser->fetch();

    if (!$user) {
        $pdo->commit();
        password_reset_session_invalid();
    }

    $getOtp = $pdo->prepare('
        SELECT
            id,
            reset_token_hash,
            expires_at <= NOW() AS is_expired
        FROM password_reset_otps
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ');

    $getOtp->execute([
        'email' => $email
    ]);

    $otpRecord = $getOtp->fetch();

    // Walang record, hindi pa na-verify ang code, o expired na.
    if (
        !$otpRecord
        || $otpRecord['reset_token_hash'] === null
    ) {
        $pdo->commit();
        password_reset_session_invalid();
    }

    if ((int) $otpRecord['is_expired'] === 1) {
        $deleteExpired = $pdo->prepare('
            DELETE FROM password_reset_otps
            WHERE id = :otp_id
        ');

        $deleteExpired->execute([
            'otp_id' => $otpRecord['id']
        ]);

        $pdo->commit();
        password_reset_session_invalid();
    }

    if (
        !hash_equals(
            (string) $otpRecord['reset_token_hash'],
            hash('sha256', $resetToken)
        )
    ) {
        $pdo->commit();
        password_reset_session_invalid();
    }

    if (password_verify($newPassword, $user['password'])) {
        // Hindi ginagalaw ang token para makapili ulit ng ibang password.
        $pdo->rollBack();

        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' =>
                'Choose a password different from your current password.',
            'errors' => [
                'new_password' =>
                    'New password must be different from your current password.'
            ]
        ]);

        exit;
    }

    $hashedPassword = password_hash(
        $newPassword,
        PASSWORD_DEFAULT
    );

    if ($hashedPassword === false) {
        throw new RuntimeException(
            'Unable to secure the new password.'
        );
    }

    $updatePassword = $pdo->prepare('
        UPDATE users
        SET password = :password
        WHERE id = :user_id
    ');

    $updatePassword->execute([
        'password' => $hashedPassword,
        'user_id' => $user['id']
    ]);

    $deleteUsedOtp = $pdo->prepare('
        DELETE FROM password_reset_otps
        WHERE id = :otp_id
    ');

    $deleteUsedOtp->execute([
        'otp_id' => $otpRecord['id']
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' =>
            'Password reset successfully. You can now sign in.'
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' =>
            'Unable to reset the password.'
    ]);
}