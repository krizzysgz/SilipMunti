<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$status = $_GET['status'] ?? 'all';
$type = $_GET['type'] ?? '';

$allowedStatuses = ['all', 'read', 'unread'];

$allowedTypes = [
    'message_alert',
    'document_status',
    'listing_status'
];

if (!in_array($status, $allowedStatuses, true)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid notification status.'
    ]);
    exit;
}

if ($type !== '' && !in_array($type, $allowedTypes, true)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid notification type.'
    ]);
    exit;
}

$sql = "
    SELECT
        id,
        inquiry_id,
        notification_type,
        message,
        is_read,
        created_at
    FROM notifications
    WHERE user_id = :user_id
";

$params = [
    'user_id' => $user['id']
];

if ($status === 'read') {
    $sql .= " AND is_read = 1";
} elseif ($status === 'unread') {
    $sql .= " AND is_read = 0";
}

if ($type !== '') {
    $sql .= " AND notification_type = :notification_type";
    $params['notification_type'] = $type;
}

$sql .= " ORDER BY created_at DESC, id DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$notifications = $stmt->fetchAll();

foreach ($notifications as &$notification) {
    $notification['is_read'] = (bool) $notification['is_read'];

    if (
        $notification['notification_type'] === 'message_alert'
        && $notification['inquiry_id']
    ) {
        $notification['target_url'] =
            '/SilipMunti/frontend/messages.html?inquiry_id=' .
            $notification['inquiry_id'];
    } else {
        $notification['target_url'] = null;
    }
}

$countStmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM notifications
    WHERE user_id = :user_id
        AND is_read = 0
");

$countStmt->execute([
    'user_id' => $user['id']
]);

$unreadCount = (int) $countStmt->fetchColumn();

echo json_encode([
    'success' => true,
    'message' => 'Notifications retrieved successfully.',
    'data' => [
        'total' => count($notifications),
        'unread_count' => $unreadCount,
        'notifications' => $notifications
    ]
]);