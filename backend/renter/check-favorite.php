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

$renter = require_role($pdo, ['renter']);
$listingId = $_GET['listing_id'] ?? '';

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);
    exit;
}

try {
    $listingStmt = $pdo->prepare("
        SELECT l.id
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

    $favoriteId = $favoriteStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'message' => 'Favorite status retrieved successfully.',
        'data' => [
            'listing_id' => (int) $listingId,
            'is_favorite' => $favoriteId !== false,
            'favorite_id' => $favoriteId !== false
                ? (int) $favoriteId
                : null
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to check favorite status.'
    ]);
}
