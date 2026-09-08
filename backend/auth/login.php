<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';
require_once __DIR__ . '/../middleware/rate-limiter.php';
require_once __DIR__ . '/../security/turnstile.php';

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
$password = $data['password'] ?? '';
$turnstileToken = trim($data['turnstile_token'] ?? '');

$errors = [];

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (strlen($email) > 254) {
    $errors['email'] = 'Email address is too long.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
}

if ($password === '') {
    $errors['password'] = 'Password is required.';
} elseif (strlen($password) > 255) {
    $errors['password'] = 'Password is too long.';
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
        'login',
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
                'Too many login attempts. Try again later.',
            'data' => [
                'retry_after' => $retryAfter
            ]
        ]);

        exit;
    }

    if (turnstile_is_enabled()) {
        $turnstileResult = turnstile_verify_token(
            $turnstileToken,
            'login'
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

    $getUser = $pdo->prepare('
        SELECT
            id,
            first_name,
            last_name,
            email,
            password,
            phone_number,
            role,
            landlord_status,
            landlord_reviewed_at,
            landlord_rejection_reason,
            profile_picture
        FROM users
        WHERE email = :email
            AND deleted_at IS NULL
        LIMIT 1
    ');

    $getUser->execute([
        'email' => $email
    ]);

    $user = $getUser->fetch();

    $dummyPasswordHash =
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/'
        . '.og/at2uheWG/igi.';

    $passwordHash = $user
        ? $user['password']
        : $dummyPasswordHash;

    $passwordIsValid = password_verify(
        $password,
        $passwordHash
    );

    if (!$user || !$passwordIsValid) {
        $failureState = auth_rate_limit_record_failure(
            $pdo,
            'login',
            $email
        );

        usleep(random_int(150000, 300000));

        if ($failureState['blocked']) {
            $retryAfter = max(
                1,
                (int) $failureState['retry_after']
            );

            header('Retry-After: ' . $retryAfter);
            http_response_code(429);

            echo json_encode([
                'success' => false,
                'message' =>
                    'Too many login attempts. Try again later.',
                'data' => [
                    'retry_after' => $retryAfter
                ]
            ]);

            exit;
        }

        http_response_code(401);

        echo json_encode([
            'success' => false,
            'message' => 'Invalid email or password.'
        ]);

        exit;
    }

    auth_rate_limit_clear_success(
        $pdo,
        'login',
        $email
    );

    if (
        password_needs_rehash(
            $user['password'],
            PASSWORD_DEFAULT
        )
    ) {
        $newHash = password_hash(
            $password,
            PASSWORD_DEFAULT
        );

        if ($newHash === false) {
            throw new RuntimeException(
                'Unable to secure the password.'
            );
        }

        $rehashStatement = $pdo->prepare('
            UPDATE users
            SET password = :password
            WHERE id = :user_id
        ');

        $rehashStatement->execute([
            'password' => $newHash,
            'user_id' => $user['id']
        ]);
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    session_regenerate_id(true);

    $_SESSION = [];
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['logged_in_at'] = time();
    $_SESSION['last_activity'] = time();
    $_SESSION['session_started_at'] = time();
    $_SESSION['last_regeneration'] = time();

    $user['id'] = (int) $user['id'];

    if ($user['role'] === 'landlord') {
        require_once __DIR__ . '/../config/landlord-verification.php';

        $user = array_merge(
            $user,
            get_landlord_verification_summary(
                $pdo,
                $user['id'],
                $user['landlord_status']
            )
        );
    }

    unset($user['password']);

    echo json_encode([
        'success' => true,
        'message' => 'Login successful.',
        'data' => [
            'user' => $user
        ]
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to log in.'
    ]);
}
