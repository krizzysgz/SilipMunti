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

$listingId = filter_var(
    $data['listing_id'] ?? null,
    FILTER_VALIDATE_INT
);

$action = trim($data['action'] ?? '');
$rejectionReason = trim($data['rejection_reason'] ?? '');

$errors = [];

if (!$listingId || $listingId < 1) {
    $errors['listing_id'] = 'A valid listing ID is required.';
}

if (!in_array($action, ['approved', 'rejected'], true)) {
    $errors['action'] = 'Action must be approved or rejected.';
}

if ($action === 'rejected' && $rejectionReason === '') {
    $errors['rejection_reason'] = 'Rejection reason is required.';
}

if ($errors !== []) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Validation failed.',
        'errors' => $errors
    ]);

    exit;
}

try {
    $pdo->beginTransaction();

    $getListing = $pdo->prepare(
        'SELECT
            id,
            landlord_id,
            title,
            verification_status
         FROM listings
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );

    $getListing->execute([$listingId]);

    $listing = $getListing->fetch();

    if (!$listing) {
        $pdo->rollBack();

        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Property listing not found.'
        ]);

        exit;
    }

    if ($listing['verification_status'] !== 'pending') {
        $pdo->rollBack();

        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'This property listing has already been reviewed.'
        ]);

        exit;
    }

    if ($action === 'approved') {
        $countImages = $pdo->prepare(
            'SELECT COUNT(*)
             FROM listing_images
             WHERE listing_id = ?
               AND deleted_at IS NULL'
        );

        $countImages->execute([$listingId]);

        $imageCount = (int) $countImages->fetchColumn();

        if ($imageCount === 0) {
            $pdo->rollBack();

            http_response_code(422);

            echo json_encode([
                'success' => false,
                'message' => 'A property listing must have at least one active image before approval.'
            ]);

            exit;
        }
    }

    $newStatus =
        $action === 'approved'
            ? 'verified'
            : 'rejected';

    $updateListing = $pdo->prepare(
        'UPDATE listings
         SET
            verification_status = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );

    $updateListing->execute([
        $newStatus,
        $listingId
    ]);

    if ($newStatus === 'verified') {
        $notificationMessage =
            'Your property listing "' .
            $listing['title'] .
            '" has been approved and is now visible to renters.';
    } else {
        $notificationMessage =
            'Your property listing "' .
            $listing['title'] .
            '" has been rejected. Reason: ' .
            $rejectionReason;
    }

    $createNotification = $pdo->prepare(
        'INSERT INTO notifications (
            user_id,
            inquiry_id,
            notification_type,
            message
         ) VALUES (?, NULL, "listing_status", ?)'
    );

    $createNotification->execute([
        $listing['landlord_id'],
        $notificationMessage
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Property listing review completed successfully.',
        'data' => [
            'listing_id' => (int) $listing['id'],
            'title' => $listing['title'],
            'verification_status' => $newStatus,
            'rejection_reason' =>
                $newStatus === 'rejected'
                    ? $rejectionReason
                    : null
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
        'message' => 'Unable to complete property listing review.'
    ]);
}