<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';

function password_reset_verify_failed(): never
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
        SELECT id
        FROM users
        WHERE email = :email
            AND deleted_at IS NULL
        LIMIT 1
    ');

    $getUser->execute([
        'email' => $email
    ]);

    if (!$getUser->fetch()) {
        $pdo->commit();
        password_reset_verify_failed();
    }

    $getOtp = $pdo->prepare('
        SELECT
            id,
            otp_hash,
            attempts,
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

    if (!$otpRecord) {
        $pdo->commit();
        password_reset_verify_failed();
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
        password_reset_verify_failed();
    }

    // Ang code ay isang beses lang magagamit.
    // Kung may reset token na, na-verify na ito dati.
    if ($otpRecord['reset_token_hash'] !== null) {
        $pdo->commit();
        password_reset_verify_failed();
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
        password_reset_verify_failed();
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
        password_reset_verify_failed();
    }

    // Tamang code: gumawa ng reset token na may 10 minutong bisa.
    // Ang hash lang ng token ang itinatago sa database.
    $resetToken = bin2hex(random_bytes(32));
    $resetTokenHash = hash('sha256', $resetToken);

    $saveToken = $pdo->prepare('
        UPDATE password_reset_otps
        SET
            reset_token_hash = :reset_token_hash,
            expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
            updated_at = NOW()
        WHERE id = :otp_id
    ');

    $saveToken->execute([
        'reset_token_hash' => $resetTokenHash,
        'otp_id' => $otpRecord['id']
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Verification code confirmed.',
        'data' => [
            'reset_token' => $resetToken,
            'expires_in' => 600
        ]
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to verify the code.'
    ]);
}