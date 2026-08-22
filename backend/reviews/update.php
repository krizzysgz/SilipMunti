<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
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

$reviewId = $data['review_id'] ?? '';
$rating = $data['rating'] ?? '';
$comment = trim($data['comment'] ?? '');

if (!ctype_digit((string) $reviewId) || (int) $reviewId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid review ID is required.'
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

$reviewStmt = $pdo->prepare("
    SELECT id
    FROM reviews
    WHERE id = :review_id
        AND renter_id = :renter_id
        AND deleted_at IS NULL
    LIMIT 1
");

$reviewStmt->execute([
    'review_id' => (int) $reviewId,
    'renter_id' => $renter['id']
]);

if (!$reviewStmt->fetch()) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Review not found.'
    ]);
    exit;
}

$updateStmt = $pdo->prepare("
    UPDATE reviews
    SET
        rating = :rating,
        comment = :comment
    WHERE id = :review_id
        AND renter_id = :renter_id
        AND deleted_at IS NULL
");

$updateStmt->execute([
    'rating' => (int) $rating,
    'comment' => $comment !== '' ? $comment : null,
    'review_id' => (int) $reviewId,
    'renter_id' => $renter['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'Review updated successfully.',
    'data' => [
        'review_id' => (int) $reviewId,
        'rating' => (int) $rating,
        'comment' => $comment !== '' ? $comment : null
    ]
]);