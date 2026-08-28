<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';

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

$firstName = trim($data['first_name'] ?? '');
$lastName = trim($data['last_name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$phoneNumber = trim($data['phone_number'] ?? '');
$password = $data['password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';
$role = trim($data['role'] ?? '');

$errors = [];

if ($firstName === '') {
    $errors['first_name'] = 'First name is required.';
} elseif (mb_strlen($firstName) > 100) {
    $errors['first_name'] =
        'First name must not exceed 100 characters.';
}

if ($lastName === '') {
    $errors['last_name'] = 'Last name is required.';
} elseif (mb_strlen($lastName) > 100) {
    $errors['last_name'] =
        'Last name must not exceed 100 characters.';
}

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (strlen($email) > 254) {
    $errors['email'] = 'Email address is too long.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
}

if (
    $phoneNumber !== ''
    && mb_strlen($phoneNumber) > 30
) {
    $errors['phone_number'] =
        'Phone number must not exceed 30 characters.';
}

if ($password === '') {
    $errors['password'] = 'Password is required.';
} elseif (strlen($password) < 8) {
    $errors['password'] =
        'Password must contain at least 8 characters.';
} elseif (strlen($password) > 255) {
    $errors['password'] = 'Password is too long.';
}

if ($confirmPassword === '') {
    $errors['confirm_password'] =
        'Password confirmation is required.';
} elseif ($password !== $confirmPassword) {
    $errors['confirm_password'] =
        'Passwords do not match.';
}

if (!in_array($role, ['renter', 'landlord'], true)) {
    $errors['role'] =
        'Role must be renter or landlord.';
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
    ");

    $checkUser->execute([
        'email' => $email
    ]);

    if ($checkUser->fetch()) {
        $pdo->rollBack();

        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' =>
                'Email address is already registered.'
        ]);
        exit;
    }

    $hashedPassword = password_hash(
        $password,
        PASSWORD_DEFAULT
    );

    $insertUser = $pdo->prepare("
        INSERT INTO users (
            first_name,
            last_name,
            email,
            password,
            phone_number,
            role
        )
        VALUES (
            :first_name,
            :last_name,
            :email,
            :password,
            :phone_number,
            :role
        )
    ");

    $insertUser->execute([
        'first_name' => $firstName,
        'last_name' => $lastName,
        'email' => $email,
        'password' => $hashedPassword,
        'phone_number' =>
            $phoneNumber !== ''
                ? $phoneNumber
                : null,
        'role' => $role
    ]);

    $userId = (int) $pdo->lastInsertId();

    if ($role === 'landlord') {
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
                'Complete your landlord verification. '
                . 'Upload your valid ID, barangay '
                . 'clearance, and land title before '
                . 'adding a property.'
        ]);
    }

    $pdo->commit();

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' =>
            $role === 'landlord'
                ? 'Account created successfully. '
                    . 'Complete your landlord verification '
                    . 'before adding a property.'
                : 'Account created successfully.',
        'data' => [
            'user_id' => $userId,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'phone_number' =>
                $phoneNumber !== ''
                    ? $phoneNumber
                    : null,
            'role' => $role,
            'verification_required' =>
                $role === 'landlord'
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
        'message' => 'Unable to create account.'
    ]);
}