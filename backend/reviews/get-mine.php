<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

$stmt = $pdo->prepare("
    SELECT
        r.id AS review_id,
        r.listing_id,
        r.rating,
        r.comment,
        r.created_at,
        l.title AS listing_title,
        l.price,
        l.address,
        l.barangay,
        l.availability_status
    FROM reviews r
    INNER JOIN listings l
        ON l.id = r.listing_id
    WHERE r.renter_id = :renter_id
        AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC, r.id DESC
");

$stmt->execute([
    'renter_id' => $renter['id']
]);

$reviews = $stmt->fetchAll();

foreach ($reviews as &$review) {
    $review['rating'] = (int) $review['rating'];
}

echo json_encode([
    'success' => true,
    'message' => 'Your reviews were retrieved successfully.',
    'data' => [
        'total' => count($reviews),
        'reviews' => $reviews
    ]
]);