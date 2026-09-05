<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';

function password_reset_invalid_response(): never
{
    usleep(random_int(120000, 240000));

    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'The verification code is invalid or expired.',
        'errors' => [
            'otp' => 'Enter a valid, unexpired verification code.'
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
$otp = trim((string) ($data['otp'] ?? ''));
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

if ($otp === '') {
    $errors['otp'] = 'Verification code is required.';
} elseif (!preg_match('/^\d{6}$/', $otp)) {
    $errors['otp'] =
        'Verification code must contain exactly six digits.';
}

if ($newPassword === '') {
    $errors['new_password'] = 'New password is required.';
} elseif (strlen($newPassword) < 8) {
    $errors['new_password'] =
        'New password must contain at least 8 characters.';
} elseif (strlen($newPassword) > 255) {
    $errors['new_password'] = 'New password is too long.';
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
        password_reset_invalid_response();
    }

    $getOtp = $pdo->prepare('
        SELECT
            id,
            otp_hash,
            attempts,
            expires_at,
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

    if (!$otpRecord) {
        $pdo->commit();
        password_reset_invalid_response();
    }

    if ((int) $otpRecord['is_expired'] === 1) {
        $deleteExpiredOtp = $pdo->prepare('
            DELETE FROM password_reset_otps
            WHERE id = :otp_id
        ');

        $deleteExpiredOtp->execute([
            'otp_id' => $otpRecord['id']
        ]);

        $pdo->commit();
        password_reset_invalid_response();
    }

    if ((int) $otpRecord['attempts'] >= 5) {
        $deleteLockedOtp = $pdo->prepare('
            DELETE FROM password_reset_otps
            WHERE id = :otp_id
        ');

        $deleteLockedOtp->execute([
            'otp_id' => $otpRecord['id']
        ]);

        $pdo->commit();
        password_reset_invalid_response();
    }

    if (!password_verify($otp, $otpRecord['otp_hash'])) {
        $newAttemptCount =
            (int) $otpRecord['attempts'] + 1;

        if ($newAttemptCount >= 5) {
            $deleteOtp = $pdo->prepare('
                DELETE FROM password_reset_otps
                WHERE id = :otp_id
            ');

            $deleteOtp->execute([
                'otp_id' => $otpRecord['id']
            ]);
        } else {
            $updateAttempts = $pdo->prepare('
                UPDATE password_reset_otps
                SET
                    attempts = :attempts,
                    updated_at = NOW()
                WHERE id = :otp_id
            ');

            $updateAttempts->execute([
                'attempts' => $newAttemptCount,
                'otp_id' => $otpRecord['id']
            ]);
        }

        $pdo->commit();
        password_reset_invalid_response();
    }

    if (password_verify($newPassword, $user['password'])) {
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
