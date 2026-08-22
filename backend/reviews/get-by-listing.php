<?php

header('Content-Type: application/json');

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$listingId = $_GET['listing_id'] ?? '';

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);
    exit;
}

$listingStmt = $pdo->prepare("
    SELECT
        id,
        title
    FROM listings
    WHERE id = :listing_id
        AND verification_status = 'verified'
        AND deleted_at IS NULL
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

$reviewStmt = $pdo->prepare("
    SELECT
        r.id,
        r.renter_id,
        r.rating,
        r.comment,
        r.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS renter_name,
        u.profile_picture
    FROM reviews r
    INNER JOIN users u
        ON u.id = r.renter_id
    WHERE r.listing_id = :listing_id
        AND r.deleted_at IS NULL
        AND u.deleted_at IS NULL
    ORDER BY r.created_at DESC, r.id DESC
");

$reviewStmt->execute([
    'listing_id' => (int) $listingId
]);

$reviews = $reviewStmt->fetchAll();

$totalRating = 0;

foreach ($reviews as &$review) {
    $review['rating'] = (int) $review['rating'];
    $totalRating += $review['rating'];
}

$totalReviews = count($reviews);

$averageRating = $totalReviews > 0
    ? round($totalRating / $totalReviews, 1)
    : 0;

echo json_encode([
    'success' => true,
    'message' => 'Reviews retrieved successfully.',
    'data' => [
        'listing' => [
            'id' => (int) $listing['id'],
            'title' => $listing['title']
        ],
        'summary' => [
            'average_rating' => $averageRating,
            'total_reviews' => $totalReviews
        ],
        'reviews' => $reviews
    ]
]);