<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
$messageText = trim($data['message_text'] ?? '');

if (!ctype_digit((string) $inquiryId) || (int) $inquiryId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid inquiry ID is required.'
    ]);
    exit;
}

if ($messageText === '') {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Message is required.'
    ]);
    exit;
}

if (mb_strlen($messageText) > 2000) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Message must not exceed 2000 characters.'
    ]);
    exit;
}

$inquiryStmt = $pdo->prepare("
    SELECT
        i.id,
        i.renter_id,
        i.inquiry_status,
        l.landlord_id,
        l.title AS listing_title
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
        'message' => 'You are not allowed to send a message in this inquiry.'
    ]);
    exit;
}

if ($inquiry['inquiry_status'] === 'closed') {
    http_response_code(409);

    echo json_encode([
        'success' => false,
        'message' => 'This inquiry is already closed.'
    ]);
    exit;
}

$recipientId = $user['role'] === 'renter'
    ? (int) $inquiry['landlord_id']
    : (int) $inquiry['renter_id'];

try {
    $pdo->beginTransaction();

    $messageStmt = $pdo->prepare("
        INSERT INTO messages (
            inquiry_id,
            sender_id,
            message_text,
            is_read,
            created_at
        )
        VALUES (
            :inquiry_id,
            :sender_id,
            :message_text,
            0,
            NOW()
        )
    ");

    $messageStmt->execute([
        'inquiry_id' => (int) $inquiryId,
        'sender_id' => $user['id'],
        'message_text' => $messageText
    ]);

    $messageId = (int) $pdo->lastInsertId();

    $notificationStmt = $pdo->prepare("
        INSERT INTO notifications (
            user_id,
            inquiry_id,
            notification_type,
            message,
            is_read,
            created_at
        )
        VALUES (
            :user_id,
            :inquiry_id,
            'message_alert',
            :message,
            0,
            NOW()
        )
    ");

    $notificationStmt->execute([
        'user_id' => $recipientId,
        'inquiry_id' => (int) $inquiryId,
        'message' => 'You received a new message about ' . $inquiry['listing_title'] . '.'
    ]);

    $pdo->commit();

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Message sent successfully.',
        'data' => [
            'message' => [
                'id' => $messageId,
                'inquiry_id' => (int) $inquiryId,
                'sender_id' => (int) $user['id'],
                'message_text' => $messageText,
                'is_read' => false,
                'is_mine' => true,
                'created_at' => date('Y-m-d H:i:s')
            ]
        ]
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to send message.'
    ]);
}