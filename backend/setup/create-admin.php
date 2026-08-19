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
$password = $data['password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';

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
    $checkAdmin = $pdo->query(
        'SELECT id
         FROM users
         WHERE role = "admin"
           AND deleted_at IS NULL
         LIMIT 1'
    );

    if ($checkAdmin->fetch()) {
        http_response_code(403);

        echo json_encode([
            'success' => false,
            'message' => 'An admin account already exists.'
        ]);

        exit;
    }

    $checkEmail = $pdo->prepare(
        'SELECT id
         FROM users
         WHERE email = ?
         LIMIT 1'
    );

    $checkEmail->execute([$email]);

    if ($checkEmail->fetch()) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'Email address is already registered.'
        ]);

        exit;
    }

    $hashedPassword = password_hash(
        $password,
        PASSWORD_DEFAULT
    );

    $createAdmin = $pdo->prepare(
        'INSERT INTO users (
            first_name,
            last_name,
            email,
            password,
            role
        ) VALUES (?, ?, ?, ?, "admin")'
    );

    $createAdmin->execute([
        $firstName,
        $lastName,
        $email,
        $hashedPassword
    ]);

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Initial admin account created successfully.',
        'data' => [
            'admin_id' => (int) $pdo->lastInsertId(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'role' => 'admin'
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to create admin account.'
    ]);
}