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

$renter = require_role($pdo, ['renter']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$listingId = $data['listing_id'] ?? '';

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);
    exit;
}

$listingStmt = $pdo->prepare("
    SELECT id
    FROM listings
    WHERE id = :listing_id
        AND verification_status = 'verified'
        AND deleted_at IS NULL
    LIMIT 1
");

$listingStmt->execute([
    'listing_id' => (int) $listingId
]);

if (!$listingStmt->fetch()) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Listing not found.'
    ]);
    exit;
}

$favoriteStmt = $pdo->prepare("
    SELECT id
    FROM favorites
    WHERE renter_id = :renter_id
        AND listing_id = :listing_id
    LIMIT 1
");

$favoriteStmt->execute([
    'renter_id' => $renter['id'],
    'listing_id' => (int) $listingId
]);

if ($favoriteStmt->fetch()) {
    http_response_code(409);

    echo json_encode([
        'success' => false,
        'message' => 'Listing is already in your favorites.'
    ]);
    exit;
}

$insertStmt = $pdo->prepare("
    INSERT INTO favorites (
        renter_id,
        listing_id,
        saved_at
    )
    VALUES (
        :renter_id,
        :listing_id,
        NOW()
    )
");

$insertStmt->execute([
    'renter_id' => $renter['id'],
    'listing_id' => (int) $listingId
]);

http_response_code(201);

echo json_encode([
    'success' => true,
    'message' => 'Listing added to favorites.',
    'data' => [
        'favorite_id' => (int) $pdo->lastInsertId()
    ]
]);