<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

$listingId = filter_var(
    $data['listing_id'] ?? $data['id'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$listingId || $listingId < 1) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'A valid listing ID is required.'
    ]);
    exit;
}

try {
    $pdo->beginTransaction();

    $getListing = $pdo->prepare('
        SELECT id, landlord_id, title
        FROM listings
        WHERE id = :listing_id
          AND deleted_at IS NOT NULL
        LIMIT 1
        FOR UPDATE
    ');

    $getListing->execute([
        'listing_id' => $listingId
    ]);

    $listing = $getListing->fetch();

    if (!$listing) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'Deleted listing not found.'
        ]);
        exit;
    }

    $restoreListing = $pdo->prepare('
        UPDATE listings
        SET deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :listing_id
          AND deleted_at IS NOT NULL
    ');

    $restoreListing->execute([
        'listing_id' => $listingId
    ]);

    $createNotification = $pdo->prepare('
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
            NULL,
            \'listing_status\',
            :message,
            0,
            NOW()
        )
    ');

    $createNotification->execute([
        'user_id' => $listing['landlord_id'],
        'message' => 'Your property listing "'
            . $listing['title']
            . '" was restored by an administrator.'
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Property listing restored successfully.',
        'data' => [
            'listing_id' => (int) $listing['id'],
            'title' => $listing['title'],
            'restored_by' => (int) $admin['id']
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
        'message' => 'Unable to restore property listing.'
    ]);
}
