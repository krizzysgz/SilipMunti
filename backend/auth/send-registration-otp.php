<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/../middleware/rate-limiter.php';
require_once __DIR__ . '/../security/turnstile.php';
require_once __DIR__ . '/registration-validation.php';

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

$validation = validate_registration_data($data);
$values = $validation['values'];
$errors = $validation['errors'];

$rawTurnstileToken = $data['turnstile_token'] ?? '';
$turnstileToken = is_string($rawTurnstileToken)
    ? trim($rawTurnstileToken)
    : '';

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
        'registration_otp',
        $values['email']
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
                'Too many verification requests. Try again later.',
            'data' => [
                'retry_after' => $retryAfter
            ]
        ]);

        exit;
    }

    if (turnstile_is_enabled()) {
        $turnstileResult = turnstile_verify_token(
            $turnstileToken,
            'registration_otp'
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

    $checkUser = $pdo->prepare('
        SELECT id
        FROM users
        WHERE email = :email
        LIMIT 1
    ');

    $checkUser->execute([
        'email' => $values['email']
    ]);

    if ($checkUser->fetch()) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' =>
                'Email address is already registered.',
            'errors' => [
                'email' =>
                    'Email address is already registered.'
            ]
        ]);

        exit;
    }

    $requestState = auth_rate_limit_record_failure(
        $pdo,
        'registration_otp',
        $values['email']
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
                'Too many verification requests. Try again later.',
            'data' => [
                'retry_after' => $retryAfter
            ]
        ]);

        exit;
    }

    $pdo->beginTransaction();

    $pdo->exec('
        DELETE FROM registration_otps
        WHERE expires_at < NOW()
    ');

    $getExistingOtp = $pdo->prepare('
        SELECT
            TIMESTAMPDIFF(
                SECOND,
                last_sent_at,
                NOW()
            ) AS seconds_since_send
        FROM registration_otps
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ');

    $getExistingOtp->execute([
        'email' => $values['email']
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

            header('Retry-After: ' . $retryAfter);
            http_response_code(429);

            echo json_encode([
                'success' => false,
                'message' =>
                    'Please wait before requesting another code.',
                'data' => [
                    'retry_after' => $retryAfter
                ]
            ]);

            exit;
        }
    }

    $otp = (string) random_int(100000, 999999);

    $otpHash = password_hash(
        $otp,
        PASSWORD_DEFAULT
    );

    if ($otpHash === false) {
        throw new RuntimeException(
            'Unable to secure the verification code.'
        );
    }

    $saveOtp = $pdo->prepare('
        INSERT INTO registration_otps (
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
        'email' => $values['email'],
        'otp_hash' => $otpHash,
        'replacement_otp_hash' => $otpHash
    ]);

    send_registration_otp_email(
        $values['email'],
        $values['first_name']
            . ' '
            . $values['last_name'],
        $otp
    );

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' =>
            'A verification code was sent to your email.',
        'data' => [
            'email' => $values['email'],
            'expires_in' => 600,
            'retry_after' => 60
        ]
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());

    http_response_code(503);

    echo json_encode([
        'success' => false,
        'message' =>
            'Email verification is temporarily unavailable. '
            . 'Please try again later.'
    ]);
}
