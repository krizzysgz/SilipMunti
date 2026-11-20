<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/database.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

function homeRankingImageUrl(?string $path): ?string
{
    $path = trim((string) $path);
    if ($path === '') return null;
    if (preg_match('~^https?://~i', $path) || str_starts_with($path, '/')) return $path;
    return '/SilipMunti/backend/' . ltrim($path, '/');
}

// Same review eligibility and one-decimal average as get-verified.php.
// Aggregate reviews independently of listings/favorites to prevent join fan-out.
$ratingSql = "
    SELECT rated_listing.landlord_id,
           ROUND(AVG(r.rating), 1) AS average_rating,
           COUNT(r.id) AS total_reviews
    FROM reviews r
    INNER JOIN listings rated_listing ON rated_listing.id = r.listing_id
    INNER JOIN users renter ON renter.id = r.renter_id
    WHERE r.review_type = 'listing'
      AND r.status = 'published'
      AND r.deleted_at IS NULL
      AND rated_listing.verification_status = 'verified'
      AND rated_listing.deleted_at IS NULL
      AND renter.deleted_at IS NULL
    GROUP BY rated_listing.landlord_id
";

$favoriteSql = "
    SELECT f.listing_id, COUNT(DISTINCT f.renter_id) AS favorite_count
    FROM favorites f
    INNER JOIN users saver ON saver.id = f.renter_id
    WHERE saver.role = 'renter' AND saver.deleted_at IS NULL
    GROUP BY f.listing_id
";

$availableSql = "
    SELECT l.landlord_id, COUNT(*) AS active_listing_count,
           GROUP_CONCAT(DISTINCT l.barangay ORDER BY l.barangay SEPARATOR ', ') AS available_areas
    FROM listings l
    INNER JOIN rental_types rt ON rt.id = l.rental_type_id
    WHERE l.deleted_at IS NULL
      AND l.verification_status = 'verified'
      AND l.availability_status = 'available'
      AND rt.deleted_at IS NULL
    GROUP BY l.landlord_id
";

$documentSql = "
    SELECT landlord_id, COUNT(DISTINCT document_type) AS approved_document_count
    FROM verification_documents
    WHERE verification_status = 'approved'
      AND deleted_at IS NULL AND document_type = 'valid_id'
    GROUP BY landlord_id
";

$publicScope = "
    l.deleted_at IS NULL AND u.deleted_at IS NULL
    AND u.role = 'landlord' AND u.landlord_status = 'approved'
    AND rt.deleted_at IS NULL
    AND l.verification_status = 'verified'
    AND l.availability_status = 'available'
";

try {
    $landlordSql = "
        SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name,
               u.profile_picture, u.created_at AS member_since,
               available.active_listing_count, available.available_areas,
               ratings.average_rating, ratings.total_reviews,
               COALESCE(documents.approved_document_count, 0) AS approved_document_count
        FROM users u
        INNER JOIN ({$ratingSql}) ratings ON ratings.landlord_id = u.id
        INNER JOIN ({$availableSql}) available ON available.landlord_id = u.id
        LEFT JOIN ({$documentSql}) documents ON documents.landlord_id = u.id
        WHERE u.role = 'landlord' AND u.landlord_status = 'approved'
          AND u.deleted_at IS NULL AND ratings.total_reviews > 0
        ORDER BY ratings.average_rating DESC, ratings.total_reviews DESC,
                 available.active_listing_count DESC, u.id ASC
        LIMIT 4
    ";
    $landlords = $pdo->query($landlordSql)->fetchAll(PDO::FETCH_ASSOC);
    foreach ($landlords as &$landlord) {
        foreach (['id', 'active_listing_count', 'total_reviews', 'approved_document_count'] as $field) {
            $landlord[$field] = (int) $landlord[$field];
        }
        $landlord['average_rating'] = (float) $landlord['average_rating'];
        $landlord['verification_level'] = $landlord['approved_document_count'] === 1
            ? 'fully_verified' : 'verified';
        $landlord['profile_picture_url'] = homeRankingImageUrl($landlord['profile_picture']);
        unset($landlord['profile_picture']);
    }
    unset($landlord);

    $propertySql = "
        SELECT l.id, l.landlord_id, l.rental_type_id, rt.name AS rental_type,
               l.title, l.description, l.price, l.address, l.city, l.barangay,
               l.bedroom_no, l.listing_size, l.occupancy_limit,
               l.availability_status, l.nearby_establishments,
               l.transport_routes, l.amenities, l.created_at, l.updated_at,
               CONCAT(u.first_name, ' ', u.last_name) AS landlord_name,
               u.profile_picture AS landlord_profile_picture,
               COALESCE(documents.approved_document_count, 0) AS landlord_approved_document_count,
               COALESCE(ratings.average_rating, 0) AS landlord_average_rating,
               COALESCE(ratings.total_reviews, 0) AS landlord_review_count,
               COALESCE(saved.favorite_count, 0) AS favorite_count,
               (SELECT li.image_path FROM listing_images li
                WHERE li.listing_id = l.id AND li.deleted_at IS NULL
                ORDER BY li.id ASC LIMIT 1) AS primary_image_path,
               (SELECT COUNT(*) FROM property_supporting_documents psd
                WHERE psd.listing_id = l.id AND psd.verification_status = 'approved') AS approved_property_proof_count
        FROM listings l
        INNER JOIN users u ON u.id = l.landlord_id
        INNER JOIN rental_types rt ON rt.id = l.rental_type_id
        LEFT JOIN ({$ratingSql}) ratings ON ratings.landlord_id = u.id
        LEFT JOIN ({$favoriteSql}) saved ON saved.listing_id = l.id
        LEFT JOIN ({$documentSql}) documents ON documents.landlord_id = u.id
        WHERE {$publicScope}
    ";

    // SQL sorts the full eligible inventory BEFORE taking four results.
    $topSql = $propertySql . " AND COALESCE(ratings.total_reviews, 0) > 0
        ORDER BY ratings.average_rating DESC, ratings.total_reviews DESC,
                 favorite_count DESC, l.created_at DESC, l.id DESC LIMIT 4";
    $savedSql = $propertySql . " AND COALESCE(saved.favorite_count, 0) > 0
        ORDER BY favorite_count DESC, landlord_average_rating DESC,
                 landlord_review_count DESC, l.created_at DESC, l.id DESC LIMIT 4";

    $normalize = static function (array $rows): array {
        foreach ($rows as &$listing) {
            foreach (['id', 'landlord_id', 'rental_type_id', 'landlord_approved_document_count', 'landlord_review_count', 'favorite_count'] as $field) {
                $listing[$field] = (int) $listing[$field];
            }
            foreach (['bedroom_no', 'occupancy_limit'] as $field) {
                $listing[$field] = $listing[$field] !== null ? (int) $listing[$field] : null;
            }
            $listing['price'] = (float) $listing['price'];
            $listing['listing_size'] = $listing['listing_size'] !== null ? (float) $listing['listing_size'] : null;
            $listing['landlord_average_rating'] = (float) $listing['landlord_average_rating'];
            $listing['property_verified'] = (int) $listing['approved_property_proof_count'] > 0;
            $listing['landlord_verification_level'] = $listing['landlord_approved_document_count'] === 1
                ? 'fully_verified' : 'unverified';
            $listing['landlord_profile_picture_url'] = homeRankingImageUrl($listing['landlord_profile_picture']);
            $listing['primary_image'] = homeRankingImageUrl($listing['primary_image_path']);
            unset($listing['primary_image_path'], $listing['landlord_profile_picture'], $listing['approved_property_proof_count']);
        }
        unset($listing);
        return $rows;
    };

    echo json_encode([
        'success' => true,
        'message' => 'Homepage rankings retrieved successfully.',
        'data' => [
            'top_landlords' => $landlords,
            'top_listings' => $normalize($pdo->query($topSql)->fetchAll(PDO::FETCH_ASSOC)),
            'most_favorited' => $normalize($pdo->query($savedSql)->fetchAll(PDO::FETCH_ASSOC))
        ]
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    error_log('Homepage rankings: ' . $exception->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load homepage rankings. Please try again.']);
}
