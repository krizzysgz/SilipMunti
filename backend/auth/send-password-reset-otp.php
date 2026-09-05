<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/../middleware/rate-limiter.php';
require_once __DIR__ . '/../security/turnstile.php';

function password_reset_request_response(
    string $email,
    int $retryAfter = 60
): never {
    echo json_encode([
        'success' => true,
        'message' =>
            'If an active account exists for this email, '
            . 'a password reset code was sent.',
        'data' => [
            'email' => $email,
            'expires_in' => 600,
            'retry_after' => max(1, $retryAfter)
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

$rawTurnstileToken = $data['turnstile_token'] ?? '';
$turnstileToken = is_string($rawTurnstileToken)
    ? trim($rawTurnstileToken)
    : '';

$errors = [];

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (strlen($email) > 254) {
    $errors['email'] = 'Email address is too long.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
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
    $rateLimitState = auth_rate_limit_check(
        $pdo,
        'password_reset_otp',
        $email
    );

    if ($rateLimitState['blocked']) {
        $retryAfter = max(
            1,
            (int) $rateLimitState['retry_after']
        );

        header('Retry-After: ' . $retryAfter);
        http_response_code(429);

        echo json_encode([
            'success' => false,
            'message' =>
                'Too many password reset requests. Try again later.',
            'data' => [
                'retry_after' => $retryAfter
            ]
        ]);

        exit;
    }

    if (turnstile_is_enabled()) {
        $turnstileResult = turnstile_verify_token(
            $turnstileToken,
            'password_reset_otp'
        );

        if (!$turnstileResult['success']) {
            $serviceUnavailable =
                $turnstileResult['reason']
                === 'verification_service_unavailable';

            http_response_code($serviceUnavailable ? 503 : 422);

            echo json_encode([
                'success' => false,
                'message' => $serviceUnavailable
                    ? 'Security verification is temporarily unavailable.'
                    : 'Please complete the security verification again.'
            ]);

            exit;
        }
    }

    $requestState = auth_rate_limit_record_failure(
        $pdo,
        'password_reset_otp',
        $email
    );

    if ($requestState['blocked']) {
        $retryAfter = max(
            1,
            (int) $requestState['retry_after']
        );

        header('Retry-After: ' . $retryAfter);
        http_response_code(429);

        echo json_encode([
            'success' => false,
            'message' =>
                'Too many password reset requests. Try again later.',
            'data' => [
                'retry_after' => $retryAfter
            ]
        ]);

        exit;
    }

    $getUser = $pdo->prepare('
        SELECT
            id,
            first_name,
            last_name,
            email
        FROM users
        WHERE email = :email
            AND deleted_at IS NULL
        LIMIT 1
    ');

    $getUser->execute([
        'email' => $email
    ]);

    $user = $getUser->fetch();

    if (!$user) {
        usleep(random_int(250000, 500000));
        password_reset_request_response($email);
    }

    $pdo->beginTransaction();

    $pdo->exec('
        DELETE FROM password_reset_otps
        WHERE expires_at < NOW()
    ');

    $getExistingOtp = $pdo->prepare('
        SELECT
            TIMESTAMPDIFF(
                SECOND,
                last_sent_at,
                NOW()
            ) AS seconds_since_send
        FROM password_reset_otps
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ');

    $getExistingOtp->execute([
        'email' => $email
    ]);

    $existingOtp = $getExistingOtp->fetch();

    if ($existingOtp) {
        $secondsSinceSend = max(
            0,
            (int) $existingOtp['seconds_since_send']
        );

        if ($secondsSinceSend < 60) {
            $retryAfter = 60 - $secondsSinceSend;

            $pdo->rollBack();

            usleep(random_int(250000, 500000));
            password_reset_request_response(
                $email,
                $retryAfter
            );
        }
    }

    $otp = (string) random_int(100000, 999999);

    $otpHash = password_hash(
        $otp,
        PASSWORD_DEFAULT
    );

    if ($otpHash === false) {
        throw new RuntimeException(
            'Unable to secure the password reset code.'
        );
    }

    $saveOtp = $pdo->prepare('
        INSERT INTO password_reset_otps (
            email,
            otp_hash,
            expires_at,
            attempts,
            last_sent_at,
            created_at,
            updated_at
        )
        VALUES (
            :email,
            :otp_hash,
            DATE_ADD(NOW(), INTERVAL 10 MINUTE),
            0,
            NOW(),
            NOW(),
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            otp_hash = :replacement_otp_hash,
            expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
            attempts = 0,
            last_sent_at = NOW(),
            updated_at = NOW()
    ');

    $saveOtp->execute([
        'email' => $email,
        'otp_hash' => $otpHash,
        'replacement_otp_hash' => $otpHash
    ]);

    $recipientName = trim(
        $user['first_name'] . ' ' . $user['last_name']
    );

    send_password_reset_otp_email(
        $email,
        $recipientName,
        $otp
    );

    $pdo->commit();

    password_reset_request_response($email);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());

    http_response_code(503);

    echo json_encode([
        'success' => false,
        'message' =>
            'Password reset service is temporarily unavailable.'
    ]);
}
