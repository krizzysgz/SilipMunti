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

$notificationId = $data['notification_id'] ?? '';

if (
    !ctype_digit((string) $notificationId)
    || (int) $notificationId < 1
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid notification ID is required.'
    ]);
    exit;
}

$notificationStmt = $pdo->prepare("
    SELECT
        id,
        inquiry_id,
        notification_type,
        is_read
    FROM notifications
    WHERE id = :notification_id
        AND user_id = :user_id
    LIMIT 1
");

$notificationStmt->execute([
    'notification_id' => (int) $notificationId,
    'user_id' => $user['id']
]);

$notification = $notificationStmt->fetch();

if (!$notification) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Notification not found.'
    ]);
    exit;
}

if (!(bool) $notification['is_read']) {
    $updateStmt = $pdo->prepare("
        UPDATE notifications
        SET is_read = 1
        WHERE id = :notification_id
            AND user_id = :user_id
    ");

    $updateStmt->execute([
        'notification_id' => (int) $notificationId,
        'user_id' => $user['id']
    ]);
}

echo json_encode([
    'success' => true,
    'message' => 'Notification marked as read.',
    'data' => [
        'notification_id' => (int) $notificationId,
        'is_read' => true,
        'inquiry_id' => $notification['inquiry_id']
            ? (int) $notification['inquiry_id']
            : null,
        'notification_type' => $notification['notification_type']
    ]
]);