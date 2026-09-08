<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../security/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

require_csrf_token();

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

$listingId = $data['listing_id'] ?? '';
$rawMessageText = $data['message_text'] ?? '';
$messageText = is_string($rawMessageText)
    ? trim($rawMessageText)
    : '';

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
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

$listingStmt = $pdo->prepare("
    SELECT
        l.id,
        l.landlord_id,
        l.title
    FROM listings l
    INNER JOIN users u
        ON u.id = l.landlord_id
    WHERE l.id = :listing_id
      AND l.verification_status = 'verified'
      AND l.deleted_at IS NULL
      AND u.deleted_at IS NULL
      AND u.landlord_status = 'approved'
    LIMIT 1
");

$listingStmt->execute([
    'listing_id' => (int) $listingId
]);

$listing = $listingStmt->fetch();

if (!$listing) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'Listing not found.'
    ]);
    exit;
}

try {
    $pdo->beginTransaction();

    $existingStmt = $pdo->prepare("
        SELECT
            id,
            inquiry_status
        FROM inquiries
        WHERE listing_id = :listing_id
          AND renter_id = :renter_id
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
    ");

    $existingStmt->execute([
        'listing_id' => (int) $listingId,
        'renter_id' => $renter['id']
    ]);

    $existingInquiry = $existingStmt->fetch();
    $isNewInquiry = !$existingInquiry;

    if ($existingInquiry) {
        $inquiryId = (int) $existingInquiry['id'];

        if ($existingInquiry['inquiry_status'] === 'closed') {
            $reopenStmt = $pdo->prepare("
                UPDATE inquiries
                SET inquiry_status = 'pending'
                WHERE id = :inquiry_id
            ");

            $reopenStmt->execute([
                'inquiry_id' => $inquiryId
            ]);
        }
    } else {
        $inquiryStmt = $pdo->prepare("
            INSERT INTO inquiries (
                listing_id,
                renter_id,
                inquiry_status,
                created_at
            )
            VALUES (
                :listing_id,
                :renter_id,
                'pending',
                NOW()
            )
        ");

        $inquiryStmt->execute([
            'listing_id' => (int) $listingId,
            'renter_id' => $renter['id']
        ]);

        $inquiryId = (int) $pdo->lastInsertId();
    }

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
        'inquiry_id' => $inquiryId,
        'sender_id' => $renter['id'],
        'message_text' => $messageText
    ]);

    $messageId = (int) $pdo->lastInsertId();

    $notificationMessage = $isNewInquiry
        ? 'You received a new inquiry for ' . $listing['title'] . '.'
        : 'You received a new message about ' . $listing['title'] . '.';

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
        'user_id' => $listing['landlord_id'],
        'inquiry_id' => $inquiryId,
        'message' => $notificationMessage
    ]);

    $pdo->commit();

    http_response_code($isNewInquiry ? 201 : 200);
    echo json_encode([
        'success' => true,
        'message' => $isNewInquiry
            ? 'Inquiry created successfully.'
            : 'Message added to the existing conversation.',
        'data' => [
            'inquiry_id' => $inquiryId,
            'message_id' => $messageId,
            'is_new_inquiry' => $isNewInquiry,
            'inquiry_status' => 'pending'
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
        'message' => 'Unable to create inquiry.'
    ]);
}
