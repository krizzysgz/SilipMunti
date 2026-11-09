<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';

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

foreach (['first_name', 'last_name', 'email', 'phone_number'] as $field) {
    if (array_key_exists($field, $data) && !is_string($data[$field])) {
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Invalid profile field.'
        ]);
        exit;
    }
}

try {
    $pdo->beginTransaction();

    $currentStmt = $pdo->prepare("
        SELECT
            first_name,
            last_name,
            email,
            phone_number,
            role,
            session_version
        FROM users
        WHERE id = :user_id
            AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
    ");

    $currentStmt->execute([
        'user_id' => $user['id']
    ]);

    $currentUser = $currentStmt->fetch();

    if (
        !$currentUser
        || (int) $currentUser['session_version']
            !== ($_SESSION['session_version'] ?? null)
    ) {
        $pdo->rollBack();
        clear_user_session();

        authentication_error('Please sign in again.', 401);
    }

    $firstName = trim($data['first_name'] ?? $currentUser['first_name']);
    $lastName = trim($data['last_name'] ?? $currentUser['last_name']);

    $phoneNumber = trim(
        $data['phone_number'] ?? ($currentUser['phone_number'] ?? '')
    );

    if (
        isset($data['email'])
        && strcasecmp(trim($data['email']), $currentUser['email']) !== 0
    ) {
        $pdo->rollBack();
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' =>
                'Use the verified email-change form to change your email.',
            'errors' => [
                'email' => 'Email changes require password and OTP verification.'
            ]
        ]);
        exit;
    }

    if (
        $firstName === ''
        || $lastName === ''
        || mb_strlen($firstName) > 100
        || mb_strlen($lastName) > 100
    ) {
        $pdo->rollBack();
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' =>
                'First name and last name are required and must not exceed 100 characters.'
        ]);
        exit;
    }

    if (
        $phoneNumber !== ''
        && !preg_match('/^[0-9+\-\s()]{7,20}$/', $phoneNumber)
    ) {
        $pdo->rollBack();
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Invalid phone number.'
        ]);
        exit;
    }

    $updateStmt = $pdo->prepare("
        UPDATE users
        SET
            first_name = :first_name,
            last_name = :last_name,
            phone_number = :phone_number
        WHERE id = :user_id
            AND deleted_at IS NULL
    ");

    $updateStmt->execute([
        'first_name' => $firstName,
        'last_name' => $lastName,
        'phone_number' => $phoneNumber !== '' ? $phoneNumber : null,
        'user_id' => $user['id']
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Profile updated successfully.',
        'data' => [
            'profile' => [
                'id' => (int) $user['id'],
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $currentUser['email'],
                'phone_number' => $phoneNumber !== '' ? $phoneNumber : null,
                'role' => $currentUser['role']
            ]
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
        'message' => 'Unable to update profile.'
    ]);
}