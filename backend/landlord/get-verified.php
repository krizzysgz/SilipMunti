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

$search = trim($_GET['search'] ?? '');
$barangay = trim($_GET['barangay'] ?? '');
$sort = trim($_GET['sort'] ?? 'listings_desc');
$page = $_GET['page'] ?? '1';
$limit = $_GET['limit'] ?? '12';

$allowedSorts = [
    'listings_desc',
    'rating_desc',
    'newest',
    'name_asc'
];

if (mb_strlen($search) > 100) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Search must not exceed 100 characters.'
    ]);
    exit;
}

if (mb_strlen($barangay) > 100) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Location must not exceed 100 characters.'
    ]);
    exit;
}

if (!in_array($sort, $allowedSorts, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid sorting option.'
    ]);
    exit;
}

if (!ctype_digit((string) $page) || (int) $page < 1) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid page number.'
    ]);
    exit;
}

if (
    !ctype_digit((string) $limit)
    || (int) $limit < 1
    || (int) $limit > 48
) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Limit must be between 1 and 48.'
    ]);
    exit;
}

$page = (int) $page;
$limit = (int) $limit;
$offset = ($page - 1) * $limit;

$verificationJoin = "
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
";

$whereConditions = [
    "u.role = 'landlord'",
    "u.landlord_status = 'approved'",
    'u.deleted_at IS NULL'
];
$params = [];

if ($search !== '') {
    $whereConditions[] = "(
        CONCAT(u.first_name, ' ', u.last_name) LIKE :search_name
        OR EXISTS (
            SELECT 1
            FROM listings search_listing
            WHERE search_listing.landlord_id = u.id
              AND search_listing.verification_status = 'verified'
              AND search_listing.availability_status = 'available'
              AND search_listing.deleted_at IS NULL
              AND (
                  search_listing.barangay LIKE :search_barangay
                  OR search_listing.city LIKE :search_city
              )
        )
    )";
    $searchValue = '%' . $search . '%';
    $params['search_name'] = $searchValue;
    $params['search_barangay'] = $searchValue;
    $params['search_city'] = $searchValue;
}

if ($barangay !== '') {
    $whereConditions[] = "EXISTS (
        SELECT 1
        FROM listings location_listing
        WHERE location_listing.landlord_id = u.id
          AND location_listing.verification_status = 'verified'
          AND location_listing.availability_status = 'available'
          AND location_listing.deleted_at IS NULL
          AND location_listing.barangay = :barangay
    )";
    $params['barangay'] = $barangay;
}

$whereSql = implode(' AND ', $whereConditions);

$orderBy = match ($sort) {
    'rating_desc' => 'average_rating DESC, total_reviews DESC, active_listing_count DESC',
    'newest' => 'u.created_at DESC, u.id DESC',
    'name_asc' => 'name ASC, u.id DESC',
    default => 'active_listing_count DESC, average_rating DESC, u.created_at DESC'
};

try {
    $statisticsStatement = $pdo->prepare("
        SELECT
            COUNT(DISTINCT u.id) AS total_landlords,
            COUNT(DISTINCT statistics_listing.id) AS total_active_listings
        FROM users u
        {$verificationJoin}
        LEFT JOIN listings statistics_listing
            ON statistics_listing.landlord_id = u.id
           AND statistics_listing.verification_status = 'verified'
           AND statistics_listing.availability_status = 'available'
           AND statistics_listing.deleted_at IS NULL
        WHERE {$whereSql}
    ");
    $statisticsStatement->execute($params);
    $statistics = $statisticsStatement->fetch() ?: [];
    $total = (int) ($statistics['total_landlords'] ?? 0);
    $totalActiveListings =
        (int) ($statistics['total_active_listings'] ?? 0);

    $totalPages = $total > 0
        ? (int) ceil($total / $limit)
        : 0;

    if ($totalPages > 0 && $page > $totalPages) {
        $page = $totalPages;
        $offset = ($page - 1) * $limit;
    }

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
            ) AS available_areas,
            COALESCE(ratings.average_rating, 0) AS average_rating,
            COALESCE(ratings.total_reviews, 0) AS total_reviews
        FROM users u
        {$verificationJoin}
        LEFT JOIN listings l
            ON l.landlord_id = u.id
           AND l.verification_status = 'verified'
           AND l.availability_status = 'available'
           AND l.deleted_at IS NULL
        LEFT JOIN (
            SELECT
                rated_listing.landlord_id,
                ROUND(AVG(r.rating), 1) AS average_rating,
                COUNT(r.id) AS total_reviews
            FROM reviews r
            INNER JOIN listings rated_listing
                ON rated_listing.id = r.listing_id
            INNER JOIN users renter
                ON renter.id = r.renter_id
            WHERE r.review_type = 'listing'
              AND r.status = 'published'
              AND r.deleted_at IS NULL
              AND rated_listing.verification_status = 'verified'
              AND rated_listing.deleted_at IS NULL
              AND renter.deleted_at IS NULL
            GROUP BY rated_listing.landlord_id
        ) ratings
            ON ratings.landlord_id = u.id
        WHERE {$whereSql}
        GROUP BY
            u.id,
            u.first_name,
            u.last_name,
            u.profile_picture,
            u.created_at,
            verification.approved_document_count,
            ratings.average_rating,
            ratings.total_reviews
        ORDER BY {$orderBy}
        LIMIT {$limit}
        OFFSET {$offset}
    ");

    $statement->execute($params);
    $landlords = $statement->fetchAll();

    foreach ($landlords as &$landlord) {
        $landlord['id'] = (int) $landlord['id'];
        $landlord['active_listing_count'] =
            (int) $landlord['active_listing_count'];
        $landlord['average_rating'] =
            (float) $landlord['average_rating'];
        $landlord['total_reviews'] =
            (int) $landlord['total_reviews'];
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
    }
    unset($landlord);

    echo json_encode([
        'success' => true,
        'message' => 'Verified landlords retrieved successfully.',
        'data' => [
            'verified_landlords' => $landlords,
            'summary' => [
                'verified_landlords' => $total,
                'active_listings' => $totalActiveListings
            ],
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_items' => $total,
                'total_pages' => $totalPages,
                'has_previous_page' => $page > 1,
                'has_next_page' =>
                    $totalPages > 0
                    && $page < $totalPages
            ]
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load verified landlords.'
    ]);
}
