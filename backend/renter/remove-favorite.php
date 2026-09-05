<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../security/csrf.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
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

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);

    exit;
}

$favoriteStmt = $pdo->prepare('
    SELECT id
    FROM favorites
    WHERE renter_id = :renter_id
        AND listing_id = :listing_id
    LIMIT 1
');

$favoriteStmt->execute([
    'renter_id' => $renter['id'],
    'listing_id' => (int) $listingId
]);

$favorite = $favoriteStmt->fetch();

if (!$favorite) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Favorite not found.'
    ]);

    exit;
}

$deleteStmt = $pdo->prepare('
    DELETE FROM favorites
    WHERE id = :favorite_id
        AND renter_id = :renter_id
');

$deleteStmt->execute([
    'favorite_id' => $favorite['id'],
    'renter_id' => $renter['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'Listing removed from favorites.',
    'data' => [
        'listing_id' => (int) $listingId,
        'is_favorite' => false
    ]
]);
