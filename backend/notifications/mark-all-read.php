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

$updateStmt = $pdo->prepare("
    UPDATE notifications
    SET is_read = 1
    WHERE user_id = :user_id
        AND is_read = 0
");

$updateStmt->execute([
    'user_id' => $user['id']
]);

$markedNotifications = $updateStmt->rowCount();

echo json_encode([
    'success' => true,
    'message' => 'All notifications marked as read.',
    'data' => [
        'marked_notifications' => $markedNotifications,
        'unread_count' => 0
    ]
]);