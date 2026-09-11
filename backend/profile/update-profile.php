<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$currentStmt = $pdo->prepare("
    SELECT first_name, last_name, email, phone_number, role
    FROM users
    WHERE id = :user_id
      AND deleted_at IS NULL
    LIMIT 1
");

$currentStmt->execute([
    'user_id' => $user['id']
]);

$currentUser = $currentStmt->fetch(PDO::FETCH_ASSOC);

if (!$currentUser) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'User profile not found.'
    ]);
    exit;
}

$firstName = array_key_exists('first_name', $data)
    ? trim($data['first_name'])
    : $currentUser['first_name'];

$lastName = array_key_exists('last_name', $data)
    ? trim($data['last_name'])
    : $currentUser['last_name'];

$email = array_key_exists('email', $data)
    ? strtolower(trim($data['email']))
    : $currentUser['email'];

$phoneNumber = array_key_exists('phone_number', $data)
    ? trim($data['phone_number'])
    : ($currentUser['phone_number'] ?? '');

if ($firstName === '' || $lastName === '' || $email === '') {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'First name, last name, and email are required.'
    ]);
    exit;
}

if (mb_strlen($firstName) > 100 || mb_strlen($lastName) > 100) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'First name and last name must not exceed 100 characters.'
    ]);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid email address.'
    ]);
    exit;
}

if ($phoneNumber !== '' && !preg_match('/^[0-9+\-\s()]{7,20}$/', $phoneNumber)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid phone number.'
    ]);
    exit;
}

if ($email !== $currentUser['email']) {
    $emailStmt = $pdo->prepare("
        SELECT id
        FROM users
        WHERE email = :email
          AND id != :user_id
        LIMIT 1
    ");

    $emailStmt->execute([
        'email' => $email,
        'user_id' => $user['id']
    ]);

    if ($emailStmt->fetch()) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Email address is already in use.'
        ]);
        exit;
    }
}

$updateStmt = $pdo->prepare("
    UPDATE users
    SET
        first_name = :first_name,
        last_name = :last_name,
        email = :email,
        phone_number = :phone_number
    WHERE id = :user_id
      AND deleted_at IS NULL
");

$updateStmt->execute([
    'first_name' => $firstName,
    'last_name' => $lastName,
    'email' => $email,
    'phone_number' => $phoneNumber !== '' ? $phoneNumber : null,
    'user_id' => $user['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'Profile updated successfully.',
    'data' => [
        'profile' => [
            'id' => (int) $user['id'],
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'phone_number' => $phoneNumber !== '' ? $phoneNumber : null,
            'role' => $currentUser['role']
        ]
    ]
]);