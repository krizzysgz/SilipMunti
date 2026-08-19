<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';

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

$email = strtolower(trim($data['email'] ?? ''));
$password = $data['password'] ?? '';

$errors = [];

if ($email === '') {
    $errors['email'] = 'Email is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email address is invalid.';
}

if ($password === '') {
    $errors['password'] = 'Password is required.';
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
    $getUser = $pdo->prepare(
        'SELECT
            id,
            first_name,
            last_name,
            email,
            password,
            phone_number,
            role,
            profile_picture
         FROM users
         WHERE email = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getUser->execute([$email]);

    $user = $getUser->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        http_response_code(401);

        echo json_encode([
            'success' => false,
            'message' => 'Invalid email or password.'
        ]);

        exit;
    }

    session_regenerate_id(true);

    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['logged_in_at'] = time();

    unset($user['password']);

    echo json_encode([
        'success' => true,
        'message' => 'Login successful.',
        'data' => [
            'user' => $user
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to log in.'
    ]);
}