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

$landlord = require_role($pdo, ['landlord']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$listingId = filter_var(
    $data['listing_id'] ?? null,
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

    $getListing = $pdo->prepare(
        'SELECT
            id,
            title
         FROM listings
         WHERE id = ?
           AND landlord_id = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );

    $getListing->execute([
        $listingId,
        $landlord['id']
    ]);

    $listing = $getListing->fetch();

    if (!$listing) {
        $pdo->rollBack();

        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Listing not found or does not belong to you.'
        ]);

        exit;
    }

    $deleteListing = $pdo->prepare(
        'UPDATE listings
         SET
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND landlord_id = ?'
    );

    $deleteListing->execute([
        $listingId,
        $landlord['id']
    ]);

    $deleteImages = $pdo->prepare(
        'UPDATE listing_images
         SET
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
         WHERE listing_id = ?
           AND deleted_at IS NULL'
    );

    $deleteImages->execute([$listingId]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Property listing deleted successfully.',
        'data' => [
            'listing_id' => (int) $listing['id'],
            'title' => $listing['title']
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
        'message' => 'Unable to delete property listing.'
    ]);
}