<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
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

if (!ctype_digit((string) $reviewId) || (int) $reviewId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid review ID is required.'
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

$deleteStmt = $pdo->prepare("
    UPDATE reviews
    SET deleted_at = NOW()
    WHERE id = :review_id
        AND renter_id = :renter_id
        AND deleted_at IS NULL
");

$deleteStmt->execute([
    'review_id' => (int) $reviewId,
    'renter_id' => $renter['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'Review deleted successfully.'
]);