<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$admin = require_role($pdo, ['admin']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$userId = filter_var(
    $data['user_id'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$userId || $userId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'A valid user ID is required.'
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
            role
         FROM users
         WHERE id = ?
           AND deleted_at IS NOT NULL
         LIMIT 1'
    );

    $getUser->execute([$userId]);

    $user = $getUser->fetch();

    if (!$user) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Deleted user account not found.'
        ]);

        exit;
    }

    if ($user['role'] === 'admin') {
        http_response_code(403);

        echo json_encode([
            'success' => false,
            'message' => 'Admin accounts cannot be restored through this action.'
        ]);

        exit;
    }

    $restoreUser = $pdo->prepare(
        'UPDATE users
         SET
            deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );

    $restoreUser->execute([$userId]);

    echo json_encode([
        'success' => true,
        'message' => 'User account restored successfully.',
        'data' => [
            'user_id' => (int) $user['id'],
            'name' =>
                $user['first_name'] .
                ' ' .
                $user['last_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'status' => 'active'
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to restore user account.'
    ]);
}