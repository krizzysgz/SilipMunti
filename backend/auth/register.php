<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$firstName = trim($data['first_name'] ?? '');
$lastName = trim($data['last_name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$phoneNumber = trim($data['phone_number'] ?? '');
$password = $data['password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';
$role = $data['role'] ?? '';

$errors = [];

if ($firstName === '') {
    $errors['first_name'] = 'First name is required.';
}

if ($lastName === '') {
    $errors['last_name'] = 'Last name is required.';
}

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
}

if ($password === '') {
    $errors['password'] = 'Password is required.';
} elseif (strlen($password) < 8) {
    $errors['password'] = 'Password must contain at least 8 characters.';
}

if ($confirmPassword === '') {
    $errors['confirm_password'] = 'Password confirmation is required.';
} elseif ($password !== $confirmPassword) {
    $errors['confirm_password'] = 'Passwords do not match.';
}

if (!in_array($role, ['renter', 'landlord'], true)) {
    $errors['role'] = 'Role must be renter or landlord.';
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
    $checkUser = $pdo->prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1'
    );

    $checkUser->execute([$email]);

    if ($checkUser->fetch()) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'Email address is already registered.'
        ]);

        exit;
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $insertUser = $pdo->prepare(
        'INSERT INTO users (
            first_name,
            last_name,
            email,
            password,
            phone_number,
            role
        ) VALUES (?, ?, ?, ?, ?, ?)'
    );

    $insertUser->execute([
        $firstName,
        $lastName,
        $email,
        $hashedPassword,
        $phoneNumber !== '' ? $phoneNumber : null,
        $role
    ]);

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Account created successfully.',
        'data' => [
            'user_id' => (int) $pdo->lastInsertId(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'phone_number' => $phoneNumber !== '' ? $phoneNumber : null,
            'role' => $role
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to create account.'
    ]);
}