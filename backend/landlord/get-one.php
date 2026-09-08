<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$landlordId = $_GET['id'] ?? '';

if (
    !ctype_digit((string) $landlordId)
    || (int) $landlordId < 1
) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Valid landlord ID is required.'
    ]);
    exit;
}

try {
    $statement = $pdo->prepare("
        SELECT
            u.id,
            CONCAT(u.first_name, ' ', u.last_name) AS name,
            u.profile_picture,
            u.created_at AS member_since,
            COALESCE(
                verification.approved_document_count,
                0
            ) AS approved_document_count,
            COUNT(DISTINCT l.id) AS active_listing_count,
            GROUP_CONCAT(
                DISTINCT l.barangay
                ORDER BY l.barangay
                SEPARATOR ', '
            ) AS available_areas
        FROM users u
        LEFT JOIN (
            SELECT
                landlord_id,
                COUNT(DISTINCT document_type) AS approved_document_count
            FROM verification_documents
            WHERE verification_status = 'approved'
              AND deleted_at IS NULL
              AND document_type IN (
                  'valid_id',
                  'barangay_clearance',
                  'land_title'
            )
            GROUP BY landlord_id
        ) verification
            ON verification.landlord_id = u.id
        LEFT JOIN listings l
            ON l.landlord_id = u.id
           AND l.verification_status = 'verified'
           AND l.availability_status = 'available'
           AND l.deleted_at IS NULL
        WHERE u.id = :landlord_id
          AND u.role = 'landlord'
          AND u.landlord_status = 'approved'
          AND u.deleted_at IS NULL
        GROUP BY
            u.id,
            u.first_name,
            u.last_name,
            u.profile_picture,
            u.created_at,
            verification.approved_document_count
        LIMIT 1
    ");

    $statement->execute([
        'landlord_id' => (int) $landlordId
    ]);

    $landlord = $statement->fetch();

    if (!$landlord) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'Approved landlord not found.'
        ]);
        exit;
    }

    $landlord['id'] = (int) $landlord['id'];
    $landlord['active_listing_count'] =
        (int) $landlord['active_listing_count'];
    $landlord['approved_document_count'] =
        (int) $landlord['approved_document_count'];
    $landlord['verification_level'] =
        $landlord['approved_document_count'] === 3
            ? 'fully_verified'
            : 'verified';

    $profilePicture = $landlord['profile_picture'] ?? null;

    if (!empty($profilePicture)) {
        if (
            preg_match('/^https?:\/\//i', $profilePicture)
            || str_starts_with($profilePicture, '/')
        ) {
            $landlord['profile_picture_url'] = $profilePicture;
        } else {
            $landlord['profile_picture_url'] =
                '/SilipMunti/backend/' . ltrim($profilePicture, '/');
        }
    } else {
        $landlord['profile_picture_url'] = null;
    }

    unset($landlord['profile_picture']);

    $ratingStatement = $pdo->prepare("
        SELECT
            ROUND(AVG(r.rating), 1) AS average_rating,
            COUNT(r.id) AS total_reviews
        FROM reviews r
        INNER JOIN listings l
            ON l.id = r.listing_id
        INNER JOIN users renter
            ON renter.id = r.renter_id
        WHERE l.landlord_id = :landlord_id
          AND l.verification_status = 'verified'
          AND l.deleted_at IS NULL
          AND r.review_type = 'listing'
          AND r.status = 'published'
          AND r.deleted_at IS NULL
          AND renter.deleted_at IS NULL
    ");

    $ratingStatement->execute([
        'landlord_id' => (int) $landlordId
    ]);

    $ratingSummary = $ratingStatement->fetch() ?: [];
    $ratingSummary = [
        'average_rating' =>
            $ratingSummary['average_rating'] !== null
                ? (float) $ratingSummary['average_rating']
                : 0,
        'total_reviews' => (int) ($ratingSummary['total_reviews'] ?? 0)
    ];

    $reviewStatement = $pdo->prepare("
        SELECT
            r.id,
            r.listing_id,
            r.rating,
            r.comment,
            r.created_at,
            l.title AS listing_title,
            CONCAT(
                renter.first_name,
                ' ',
                renter.last_name
            ) AS renter_name,
            renter.profile_picture
        FROM reviews r
        INNER JOIN listings l
            ON l.id = r.listing_id
        INNER JOIN users renter
            ON renter.id = r.renter_id
        WHERE l.landlord_id = :landlord_id
          AND l.verification_status = 'verified'
          AND l.deleted_at IS NULL
          AND r.review_type = 'listing'
          AND r.status = 'published'
          AND r.deleted_at IS NULL
          AND renter.deleted_at IS NULL
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 12
    ");

    $reviewStatement->execute([
        'landlord_id' => (int) $landlordId
    ]);

    $reviews = $reviewStatement->fetchAll();

    foreach ($reviews as &$review) {
        $review['id'] = (int) $review['id'];
        $review['listing_id'] = (int) $review['listing_id'];
        $review['rating'] = (int) $review['rating'];

        $reviewProfilePicture = $review['profile_picture'] ?? null;

        if (!empty($reviewProfilePicture)) {
            if (
                preg_match('/^https?:\/\//i', $reviewProfilePicture)
                || str_starts_with($reviewProfilePicture, '/')
            ) {
                $review['profile_picture_url'] = $reviewProfilePicture;
            } else {
                $review['profile_picture_url'] =
                    '/SilipMunti/backend/'
                    . ltrim($reviewProfilePicture, '/');
            }
        } else {
            $review['profile_picture_url'] = null;
        }

        unset($review['profile_picture']);
    }
    unset($review);

    echo json_encode([
        'success' => true,
        'message' => 'Verified landlord retrieved successfully.',
        'data' => [
            'landlord' => $landlord,
            'rating_summary' => $ratingSummary,
            'reviews' => $reviews
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load the landlord profile.'
    ]);
}
