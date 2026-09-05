<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

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

$reviewType = trim($data['review_type'] ?? '');
$listingId = $data['listing_id'] ?? null;
$rating = $data['rating'] ?? '';
$comment = trim($data['comment'] ?? '');
$allowedReviewTypes = ['platform', 'listing'];

if (!in_array($reviewType, $allowedReviewTypes, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Review type must be platform or listing.'
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

if ($comment === '') {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Comment is required.'
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

$normalizedListingId = null;

try {
    if ($reviewType === 'listing') {
        if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'message' => 'Valid listing ID is required for a listing review.'
            ]);
            exit;
        }

        $normalizedListingId = (int) $listingId;

        $listingStmt = $pdo->prepare("
            SELECT id
            FROM listings
            WHERE id = :listing_id
              AND verification_status = 'verified'
              AND deleted_at IS NULL
            LIMIT 1
        ");

        $listingStmt->execute([
            'listing_id' => $normalizedListingId
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
            'listing_id' => $normalizedListingId,
            'renter_id' => (int) $renter['id']
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
            WHERE review_type = 'listing'
              AND listing_id = :listing_id
              AND renter_id = :renter_id
              AND deleted_at IS NULL
            LIMIT 1
        ");

        $existingStmt->execute([
            'listing_id' => $normalizedListingId,
            'renter_id' => (int) $renter['id']
        ]);

        if ($existingStmt->fetch()) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => 'You already reviewed this listing.'
            ]);
            exit;
        }
    } else {
        $existingStmt = $pdo->prepare("
            SELECT id
            FROM reviews
            WHERE review_type = 'platform'
              AND renter_id = :renter_id
              AND deleted_at IS NULL
            LIMIT 1
        ");

        $existingStmt->execute([
            'renter_id' => (int) $renter['id']
        ]);

        if ($existingStmt->fetch()) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => 'You already submitted a SilipMunti experience review.'
            ]);
            exit;
        }
    }

    $insertStmt = $pdo->prepare("
        INSERT INTO reviews (
            listing_id,
            renter_id,
            review_type,
            rating,
            comment,
            status,
            created_at
        )
        VALUES (
            :listing_id,
            :renter_id,
            :review_type,
            :rating,
            :comment,
            'published',
            NOW()
        )
    ");

    $insertStmt->execute([
        'listing_id' => $normalizedListingId,
        'renter_id' => (int) $renter['id'],
        'review_type' => $reviewType,
        'rating' => (int) $rating,
        'comment' => $comment
    ]);

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => $reviewType === 'platform'
            ? 'SilipMunti experience review submitted successfully.'
            : 'Listing review submitted successfully.',
        'data' => [
            'review_id' => (int) $pdo->lastInsertId(),
            'review_type' => $reviewType,
            'listing_id' => $normalizedListingId
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to submit review.'
    ]);
}
