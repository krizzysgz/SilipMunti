<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

$status = trim($_GET['status'] ?? 'all');
$type = trim($_GET['type'] ?? '');

$allowedStatuses = [
    'all',
    'read',
    'unread'
];

$allowedTypes = [
    'message_alert',
    'verification_required',
    'document_submission',
    'document_status',
    'account_verified',
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

if (
    $type !== ''
    && !in_array($type, $allowedTypes, true)
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid notification type.'
    ]);
    exit;
}

try {
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
          AND deleted_at IS NULL
    ";

    $params = [
        'user_id' => (int) $user['id']
    ];

    if ($status === 'read') {
        $sql .= " AND is_read = 1";
    } elseif ($status === 'unread') {
        $sql .= " AND is_read = 0";
    }

    if ($type !== '') {
        $sql .= "
            AND notification_type = :notification_type
        ";

        $params['notification_type'] = $type;
    }

    $sql .= "
        ORDER BY created_at DESC, id DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $notifications = $stmt->fetchAll();

    foreach ($notifications as &$notification) {
        $notification['id'] =
            (int) $notification['id'];

        $notification['inquiry_id'] =
            $notification['inquiry_id'] !== null
                ? (int) $notification['inquiry_id']
                : null;

        $notification['is_read'] =
            (bool) $notification['is_read'];

        switch ($notification['notification_type']) {
            case 'message_alert':
                if ($notification['inquiry_id'] !== null) {
                    $notification['target_url'] =
                        '/SilipMunti/frontend/pages/messages/index.html'
                        . '?inquiry_id='
                        . $notification['inquiry_id'];
                } else {
                    $notification['target_url'] =
                        '/SilipMunti/frontend/pages/messages/index.html';
                }
                break;

            case 'verification_required':
            case 'document_status':
            case 'account_verified':
                $notification['target_url'] =
                    '/SilipMunti/frontend/pages/landlord/'
                    . 'verification.html';
                break;

            case 'document_submission':
                $notification['target_url'] =
                    '/SilipMunti/frontend/pages/admin/'
                    . 'verifications.html';
                break;

            case 'listing_status':
                $notification['target_url'] =
                    '/SilipMunti/frontend/pages/landlord/'
                    . 'listings.html';
                break;

            default:
                $notification['target_url'] = null;
                break;
        }
    }

    unset($notification);

    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM notifications
        WHERE user_id = :user_id
          AND is_read = 0
          AND deleted_at IS NULL
    ");

    $countStmt->execute([
        'user_id' => (int) $user['id']
    ]);

    $unreadCount =
        (int) $countStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'message' =>
            'Notifications retrieved successfully.',
        'data' => [
            'total' => count($notifications),
            'unread_count' => $unreadCount,
            'notifications' => $notifications
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' =>
            'Unable to retrieve notifications.'
    ]);
}