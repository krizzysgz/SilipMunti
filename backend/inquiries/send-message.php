<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_role($pdo, ['renter', 'landlord']);

$data = json_decode(
    file_get_contents('php://input'),
    true
);

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
$replyToMessageId = $data['reply_to_message_id'] ?? null;

if (
    !ctype_digit((string) $inquiryId)
    || (int) $inquiryId < 1
) {
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

if (
    $replyToMessageId !== null
    && (
        !ctype_digit((string) $replyToMessageId)
        || (int) $replyToMessageId < 1
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid reply message ID.'
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
        AND l.deleted_at IS NULL
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

$replyToMessage = null;

if ($replyToMessageId !== null) {
    $replyStmt = $pdo->prepare("
        SELECT
            m.id,
            m.inquiry_id,
            m.sender_id,
            m.message_text,
            CONCAT(u.first_name, ' ', u.last_name) AS sender_name
        FROM messages m
        INNER JOIN users u
            ON u.id = m.sender_id
        WHERE m.id = :message_id
            AND m.inquiry_id = :inquiry_id
            AND m.deleted_at IS NULL
        LIMIT 1
    ");

    $replyStmt->execute([
        'message_id' => (int) $replyToMessageId,
        'inquiry_id' => (int) $inquiryId
    ]);

    $replyToMessage = $replyStmt->fetch();

    if (!$replyToMessage) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'The message you are replying to was not found in this conversation.'
        ]);
        exit;
    }
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
            reply_to_message_id,
            message_text,
            is_read,
            created_at
        )
        VALUES (
            :inquiry_id,
            :sender_id,
            :reply_to_message_id,
            :message_text,
            0,
            NOW()
        )
    ");

    $messageStmt->execute([
        'inquiry_id' => (int) $inquiryId,
        'sender_id' => (int) $user['id'],
        'reply_to_message_id' => $replyToMessageId !== null
            ? (int) $replyToMessageId
            : null,
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
        'message' => 'You received a new message about '
            . $inquiry['listing_title']
            . '.'
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
                'sender_name' => $user['first_name']
                    . ' '
                    . $user['last_name'],
                'message_text' => $messageText,
                'reply_to_message_id' => $replyToMessageId !== null
                    ? (int) $replyToMessageId
                    : null,
                'reply_to' => $replyToMessage
                    ? [
                        'id' => (int) $replyToMessage['id'],
                        'sender_id' => (int) $replyToMessage['sender_id'],
                        'sender_name' => $replyToMessage['sender_name'],
                        'message_text' => $replyToMessage['message_text']
                    ]
                    : null,
                'is_read' => false,
                'is_mine' => true,
                'created_at' => date('Y-m-d H:i:s')
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
        'message' => 'Unable to send message.'
    ]);
}