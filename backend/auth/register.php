<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';
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

$otp = preg_replace(
    '/\s+/',
    '',
    (string) ($data['otp'] ?? '')
);

if (!preg_match('/^\d{6}$/', $otp)) {
    $errors['otp'] =
        'Enter the 6-digit verification code.';
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

    $checkUser = $pdo->prepare("
        SELECT id
        FROM users
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ");

    $checkUser->execute([
        'email' => $values['email']
    ]);

    if ($checkUser->fetch()) {
        $pdo->rollBack();

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

    $getOtp = $pdo->prepare("
        SELECT
            id,
            otp_hash,
            attempts,
            expires_at <= NOW() AS is_expired
        FROM registration_otps
        WHERE email = :email
        LIMIT 1
        FOR UPDATE
    ");

    $getOtp->execute([
        'email' => $values['email']
    ]);

    $otpRecord = $getOtp->fetch();

    if (!$otpRecord) {
        $pdo->rollBack();

        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' =>
                'Request a verification code before creating your account.',
            'errors' => [
                'otp' =>
                    'Request a new verification code.'
            ]
        ]);
        exit;
    }

    if ((bool) $otpRecord['is_expired']) {
        $deleteExpiredOtp = $pdo->prepare("
            DELETE FROM registration_otps
            WHERE id = :id
        ");

        $deleteExpiredOtp->execute([
            'id' => $otpRecord['id']
        ]);

        $pdo->commit();

        http_response_code(410);

        echo json_encode([
            'success' => false,
            'message' =>
                'The verification code has expired. ' .
                'Request a new code.',
            'errors' => [
                'otp' => 'Verification code expired.'
            ]
        ]);
        exit;
    }

    if (!password_verify(
        $otp,
        $otpRecord['otp_hash']
    )) {
        $newAttemptCount =
            (int) $otpRecord['attempts'] + 1;

        if ($newAttemptCount >= 5) {
            $deleteFailedOtp = $pdo->prepare("
                DELETE FROM registration_otps
                WHERE id = :id
            ");

            $deleteFailedOtp->execute([
                'id' => $otpRecord['id']
            ]);

            $pdo->commit();

            http_response_code(429);

            echo json_encode([
                'success' => false,
                'message' =>
                    'Too many incorrect attempts. ' .
                    'Request a new code.',
                'errors' => [
                    'otp' =>
                        'Request a new verification code.'
                ]
            ]);
            exit;
        }

        $updateAttempts = $pdo->prepare("
            UPDATE registration_otps
            SET attempts = :attempts
            WHERE id = :id
        ");

        $updateAttempts->execute([
            'attempts' => $newAttemptCount,
            'id' => $otpRecord['id']
        ]);

        $pdo->commit();

        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' =>
                'The verification code is incorrect.',
            'errors' => [
                'otp' =>
                    'Incorrect verification code.'
            ],
            'data' => [
                'attempts_remaining' =>
                    5 - $newAttemptCount
            ]
        ]);
        exit;
    }

    $hashedPassword = password_hash(
        $values['password'],
        PASSWORD_DEFAULT
    );

    if ($hashedPassword === false) {
        throw new RuntimeException(
            'Unable to secure the password.'
        );
    }

    $insertUser = $pdo->prepare("
        INSERT INTO users (
            first_name,
            last_name,
            email,
            password,
            phone_number,
            role,
            landlord_status
        )
        VALUES (
            :first_name,
            :last_name,
            :email,
            :password,
            :phone_number,
            :role,
            :landlord_status
        )
    ");

    $insertUser->execute([
        'first_name' => $values['first_name'],
        'last_name' => $values['last_name'],
        'email' => $values['email'],
        'password' => $hashedPassword,
        'phone_number' =>
            $values['phone_number'] !== ''
                ? $values['phone_number']
                : null,
        'role' => $values['role'],
        'landlord_status' =>
            $values['role'] === 'landlord'
                ? 'pending'
                : null
    ]);

    $userId = (int) $pdo->lastInsertId();

    if ($values['role'] === 'landlord') {
        $insertNotification = $pdo->prepare("
            INSERT INTO notifications (
                user_id,
                inquiry_id,
                notification_type,
                message,
                is_read,
                created_at
            )
            VALUES (
                :user_id,
                NULL,
                'verification_required',
                :message,
                0,
                NOW()
            )
        ");

        $insertNotification->execute([
            'user_id' => $userId,
            'message' =>
                'Your landlord account is awaiting admin approval. ' .
                'You may upload verification documents while waiting.'
        ]);
    }

    $deleteUsedOtp = $pdo->prepare("
        DELETE FROM registration_otps
        WHERE id = :id
    ");

    $deleteUsedOtp->execute([
        'id' => $otpRecord['id']
    ]);

    $pdo->commit();

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' =>
            $values['role'] === 'landlord'
                ? 'Email verified and account created successfully. ' .
                    'Your landlord account is now awaiting admin approval.'
                : 'Email verified and account created successfully.',
        'data' => [
            'user_id' => $userId,
            'first_name' => $values['first_name'],
            'last_name' => $values['last_name'],
            'email' => $values['email'],
            'phone_number' =>
                $values['phone_number'] !== ''
                    ? $values['phone_number']
                    : null,
            'role' => $values['role'],
            'admin_approval_required' =>
                $values['role'] === 'landlord',
            'landlord_status' =>
                $values['role'] === 'landlord'
                    ? 'pending'
                    : null
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
        'message' =>
            'Unable to create account.'
    ]);
}
