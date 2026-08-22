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

$user = require_role($pdo, ['renter', 'landlord']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$inquiryId = $data['inquiry_id'] ?? '';

if (!ctype_digit((string) $inquiryId) || (int) $inquiryId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid inquiry ID is required.'
    ]);
    exit;
}

$inquiryStmt = $pdo->prepare("
    SELECT
        i.id,
        i.renter_id,
        l.landlord_id
    FROM inquiries i
    INNER JOIN listings l
        ON l.id = i.listing_id
    WHERE i.id = :inquiry_id
        AND i.deleted_at IS NULL
    LIMIT 1
");

$inquiryStmt->execute([
    'inquiry_id' => (int) $inquiryId
]);

$inquiry = $inquiryStmt->fetch();

if (!$inquiry) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Inquiry not found.'
    ]);
    exit;
}

$isRenter = (
    $user['role'] === 'renter'
    && (int) $inquiry['renter_id'] === (int) $user['id']
);

$isLandlord = (
    $user['role'] === 'landlord'
    && (int) $inquiry['landlord_id'] === (int) $user['id']
);

if (!$isRenter && !$isLandlord) {
    http_response_code(403);

    echo json_encode([
        'success' => false,
        'message' => 'You are not allowed to access this inquiry.'
    ]);
    exit;
}

try {
    $pdo->beginTransaction();

    $messageStmt = $pdo->prepare("
        UPDATE messages
        SET is_read = 1
        WHERE inquiry_id = :inquiry_id
            AND sender_id != :user_id
            AND is_read = 0
    ");

    $messageStmt->execute([
        'inquiry_id' => (int) $inquiryId,
        'user_id' => $user['id']
    ]);

    $markedMessages = $messageStmt->rowCount();

    $notificationStmt = $pdo->prepare("
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = :user_id
            AND inquiry_id = :inquiry_id
            AND notification_type = 'message_alert'
            AND is_read = 0
    ");

    $notificationStmt->execute([
        'user_id' => $user['id'],
        'inquiry_id' => (int) $inquiryId
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Messages marked as read.',
        'data' => [
            'marked_messages' => $markedMessages
        ]
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to mark messages as read.'
    ]);
}