<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/registration-validation.php';

function registration_error(int $status, string $message, array $errors = [], array $data = []): void
{
    http_response_code($status);

    $response = [
        'success' => false,
        'message' => $message,
    ];

    if ($errors !== []) {
        $response['errors'] = $errors;
    }

    if ($data !== []) {
        $response['data'] = $data;
    }

    echo json_encode($response);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    registration_error(405, 'Method not allowed.');
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$validation = validate_registration_data($data);
$values = $validation['values'];
$errors = $validation['errors'];

$otp = preg_replace('/\s+/', '', (string) ($data['otp'] ?? ''));

if (!preg_match('/^\d{6}$/', $otp)) {
    $errors['otp'] = 'Enter the 6-digit verification code.';
}

if ($errors !== []) {
    registration_error(422, 'Validation failed.', $errors);
}

$phoneNumber = $values['phone_number'] !== ''
    ? $values['phone_number']
    : null;

try {
    $pdo->beginTransaction();

    $checkEmail = $pdo->prepare("
        SELECT id
        FROM users
        WHERE LOWER(email) = :email
        LIMIT 1
    ");

    $checkEmail->execute([
        'email' => $values['email'],
    ]);

    if ($checkEmail->fetch()) {
        $pdo->rollBack();
        registration_error(409, 'Email address is already registered.', [
            'email' => 'Email address is already registered.',
        ]);
    }

    if ($phoneNumber !== null && registration_phone_exists($pdo, $phoneNumber)) {
        $pdo->rollBack();
        registration_error(409, 'Phone number is already registered.', [
            'phone_number' => 'Phone number is already registered.',
        ]);
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
        'email' => $values['email'],
    ]);

    $otpRecord = $getOtp->fetch();

    if (!$otpRecord) {
        $pdo->rollBack();
        registration_error(
            422,
            'Request a verification code before creating your account.',
            ['otp' => 'Request a new verification code.']
        );
    }

    if ((bool) $otpRecord['is_expired']) {
        $deleteExpiredOtp = $pdo->prepare("
            DELETE FROM registration_otps
            WHERE id = :id
        ");

        $deleteExpiredOtp->execute([
            'id' => $otpRecord['id'],
        ]);

        $pdo->commit();
        registration_error(410, 'The verification code has expired. Request a new code.', [
            'otp' => 'Verification code expired.',
        ]);
    }

    if (!password_verify($otp, $otpRecord['otp_hash'])) {
        $newAttemptCount = (int) $otpRecord['attempts'] + 1;

        if ($newAttemptCount >= 5) {
            $deleteFailedOtp = $pdo->prepare("
                DELETE FROM registration_otps
                WHERE id = :id
            ");

            $deleteFailedOtp->execute([
                'id' => $otpRecord['id'],
            ]);

            $pdo->commit();
            registration_error(
                429,
                'Too many incorrect attempts. Request a new code.',
                ['otp' => 'Request a new verification code.']
            );
        }

        $updateAttempts = $pdo->prepare("
            UPDATE registration_otps
            SET attempts = :attempts
            WHERE id = :id
        ");

        $updateAttempts->execute([
            'attempts' => $newAttemptCount,
            'id' => $otpRecord['id'],
        ]);

        $pdo->commit();
        registration_error(
            422,
            'The verification code is incorrect.',
            ['otp' => 'Incorrect verification code.'],
            ['attempts_remaining' => 5 - $newAttemptCount]
        );
    }

    $hashedPassword = password_hash($values['password'], PASSWORD_DEFAULT);

    if ($hashedPassword === false) {
        throw new RuntimeException('Unable to secure the password.');
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
        'phone_number' => $phoneNumber,
        'role' => $values['role'],
        'landlord_status' => $values['role'] === 'landlord' ? 'pending' : null,
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
            'message' => 'Your landlord account is awaiting admin approval. ' .
                'You may upload verification documents while waiting.',
        ]);
    }

    $deleteUsedOtp = $pdo->prepare("
        DELETE FROM registration_otps
        WHERE id = :id
    ");

    $deleteUsedOtp->execute([
        'id' => $otpRecord['id'],
    ]);

    $pdo->commit();

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => $values['role'] === 'landlord'
            ? 'Email verified and account created successfully. ' .
                'Your landlord account is now awaiting admin approval.'
            : 'Email verified and account created successfully.',
        'data' => [
            'user_id' => $userId,
            'first_name' => $values['first_name'],
            'last_name' => $values['last_name'],
            'email' => $values['email'],
            'phone_number' => $phoneNumber,
            'role' => $values['role'],
            'admin_approval_required' => $values['role'] === 'landlord',
            'landlord_status' => $values['role'] === 'landlord' ? 'pending' : null,
        ],
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    // SQLSTATE 23000 / MySQL 1062 means a unique index rejected a duplicate.
    if ($exception instanceof PDOException &&
        ($exception->errorInfo[0] ?? null) === '23000' &&
        (int) ($exception->errorInfo[1] ?? 0) === 1062) {
        try {
            $checkEmail = $pdo->prepare(" 
                SELECT id
                FROM users
                WHERE LOWER(email) = :email
                LIMIT 1
            ");
            $checkEmail->execute(['email' => $values['email']]);

            if ($checkEmail->fetch()) {
                registration_error(409, 'Email address is already registered.', [
                    'email' => 'Email address is already registered.',
                ]);
            }

            if ($phoneNumber !== null && registration_phone_exists($pdo, $phoneNumber)) {
                registration_error(409, 'Phone number is already registered.', [
                    'phone_number' => 'Phone number is already registered.',
                ]);
            }

        } catch (Throwable $lookupException) {
            error_log($lookupException->getMessage());
        }

        registration_error(409, 'Account information is already registered.');
    }

    error_log($exception->getMessage());
    registration_error(500, 'Unable to create account.');
}
