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
$rating = $data['rating'] ?? '';
$comment = trim($data['comment'] ?? '');

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);
    exit;
}

if (!ctype_digit((string) $rating) || (int) $rating < 1 || (int) $rating > 5) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Rating must be between 1 and 5.'
    ]);
    exit;
}

if (mb_strlen($comment) > 1000) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Comment must not exceed 1000 characters.'
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

$inquiryStmt = $pdo->prepare("
    SELECT id
    FROM inquiries
    WHERE listing_id = :listing_id
        AND renter_id = :renter_id
        AND deleted_at IS NULL
    LIMIT 1
");

$inquiryStmt->execute([
    'listing_id' => (int) $listingId,
    'renter_id' => $renter['id']
]);

if (!$inquiryStmt->fetch()) {
    http_response_code(403);

    echo json_encode([
        'success' => false,
        'message' => 'You must have an inquiry for this listing before submitting a review.'
    ]);
    exit;
}

$existingStmt = $pdo->prepare("
    SELECT id
    FROM reviews
    WHERE listing_id = :listing_id
        AND renter_id = :renter_id
        AND deleted_at IS NULL
    LIMIT 1
");

$existingStmt->execute([
    'listing_id' => (int) $listingId,
    'renter_id' => $renter['id']
]);

if ($existingStmt->fetch()) {
    http_response_code(409);

    echo json_encode([
        'success' => false,
        'message' => 'You already reviewed this listing.'
    ]);
    exit;
}

$insertStmt = $pdo->prepare("
    INSERT INTO reviews (
        listing_id,
        renter_id,
        rating,
        comment,
        created_at
    )
    VALUES (
        :listing_id,
        :renter_id,
        :rating,
        :comment,
        NOW()
    )
");

$insertStmt->execute([
    'listing_id' => (int) $listingId,
    'renter_id' => $renter['id'],
    'rating' => (int) $rating,
    'comment' => $comment !== '' ? $comment : null
]);

http_response_code(201);

echo json_encode([
    'success' => true,
    'message' => 'Review submitted successfully.',
    'data' => [
        'review_id' => (int) $pdo->lastInsertId()
    ]
]);