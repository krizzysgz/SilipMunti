<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';

$connection = isset($pdo)
    ? $pdo
    : (function_exists('database') ? database() : null);

if (!$connection instanceof PDO) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection is unavailable.'
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

try {
    $statement = $connection->prepare("
        SELECT
            r.id,
            r.listing_id,
            r.renter_id,
            r.review_type,
            r.rating,
            r.comment,
            r.status,
            r.created_at,
            l.title AS listing_title,
            CONCAT(u.first_name, ' ', u.last_name) AS renter_name,
            u.profile_picture
        FROM reviews r
        INNER JOIN users u
            ON u.id = r.renter_id
        LEFT JOIN listings l
            ON l.id = r.listing_id
        WHERE r.deleted_at IS NULL
          AND r.status = 'published'
          AND u.deleted_at IS NULL
          AND (
              r.review_type = 'platform'
              OR (
                  r.review_type = 'listing'
                  AND l.id IS NOT NULL
                  AND l.deleted_at IS NULL
              )
          )
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 30
    ");

    $statement->execute();
    $reviews = $statement->fetchAll(PDO::FETCH_ASSOC);

    foreach ($reviews as &$review) {
        $review['id'] = (int) $review['id'];
        $review['listing_id'] = $review['listing_id'] !== null
            ? (int) $review['listing_id']
            : null;
        $review['renter_id'] = (int) $review['renter_id'];
        $review['rating'] = (int) $review['rating'];

        if (!empty($review['profile_picture'])) {
            $review['profile_picture_url'] =
                '/SilipMunti/backend/' . ltrim($review['profile_picture'], '/');
        } else {
            $review['profile_picture_url'] = null;
        }

        unset($review['profile_picture']);
    }

    unset($review);

    echo json_encode([
        'success' => true,
        'message' => 'Reviews retrieved successfully.',
        'data' => [
            'reviews' => $reviews,
            'total' => count($reviews)
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve reviews.'
    ]);
}
