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
$rentalTypeId = $_GET['rental_type_id'] ?? '';
$minPrice = $_GET['min_price'] ?? '';
$maxPrice = $_GET['max_price'] ?? '';
$bedroomNo = $_GET['bedroom_no'] ?? '';
$sort = trim($_GET['sort'] ?? 'newest');
$page = $_GET['page'] ?? '1';
$limit = $_GET['limit'] ?? '12';

$allowedSorts = [
    'newest',
    'price_low',
    'price_high'
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
        'message' => 'Barangay must not exceed 100 characters.'
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

if (
    $rentalTypeId !== ''
    && (
        !ctype_digit((string) $rentalTypeId)
        || (int) $rentalTypeId < 1
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid rental type.'
    ]);

    exit;
}

if (
    $minPrice !== ''
    && (
        !is_numeric($minPrice)
        || (float) $minPrice < 0
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid minimum price.'
    ]);

    exit;
}

if (
    $maxPrice !== ''
    && (
        !is_numeric($maxPrice)
        || (float) $maxPrice < 0
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid maximum price.'
    ]);

    exit;
}

if (
    $minPrice !== ''
    && $maxPrice !== ''
    && (float) $minPrice > (float) $maxPrice
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Minimum price cannot be greater than maximum price.'
    ]);

    exit;
}

if (
    $bedroomNo !== ''
    && (
        !ctype_digit((string) $bedroomNo)
        || (int) $bedroomNo < 0
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid number of bedrooms.'
    ]);

    exit;
}

if (
    !ctype_digit((string) $page)
    || (int) $page < 1
) {
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

$whereConditions = [
    'l.deleted_at IS NULL',
    'u.deleted_at IS NULL',
    'rt.deleted_at IS NULL',
    "l.verification_status = 'verified'",
    "l.availability_status = 'available'"
];

$params = [];

if ($search !== '') {
    $whereConditions[] = '(
        l.title LIKE :search
        OR l.description LIKE :search
        OR l.address LIKE :search
        OR l.city LIKE :search
        OR l.barangay LIKE :search
        OR rt.name LIKE :search
    )';

    $params['search'] = '%' . $search . '%';
}

if ($barangay !== '') {
    $whereConditions[] = 'l.barangay = :barangay';
    $params['barangay'] = $barangay;
}

if ($rentalTypeId !== '') {
    $whereConditions[] =
        'l.rental_type_id = :rental_type_id';

    $params['rental_type_id'] =
        (int) $rentalTypeId;
}

if ($minPrice !== '') {
    $whereConditions[] = 'l.price >= :min_price';
    $params['min_price'] = (float) $minPrice;
}

if ($maxPrice !== '') {
    $whereConditions[] = 'l.price <= :max_price';
    $params['max_price'] = (float) $maxPrice;
}

if ($bedroomNo !== '') {
    $whereConditions[] =
        'l.bedroom_no = :bedroom_no';

    $params['bedroom_no'] = (int) $bedroomNo;
}

$whereSql = implode(' AND ', $whereConditions);

try {
    $countSql = "
        SELECT COUNT(*)
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
        WHERE {$whereSql}
    ";

    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);

    $total = (int) $countStmt->fetchColumn();
    $totalPages = $total > 0
        ? (int) ceil($total / $limit)
        : 0;

    $orderBy = match ($sort) {
        'price_low' => 'l.price ASC, l.id DESC',
        'price_high' => 'l.price DESC, l.id DESC',
        default => 'l.created_at DESC, l.id DESC'
    };

    $listingSql = "
        SELECT
            l.id,
            l.landlord_id,
            l.rental_type_id,
            rt.name AS rental_type,
            l.title,
            l.description,
            l.price,
            l.address,
            l.city,
            l.barangay,
            l.latitude,
            l.longitude,
            l.bedroom_no,
            l.listing_size,
            l.occupancy_limit,
            l.availability_status,
            l.nearby_establishments,
            l.transport_routes,
            l.amenities,
            l.created_at,
            l.updated_at,
            CONCAT(
                u.first_name,
                ' ',
                u.last_name
            ) AS landlord_name
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
        WHERE {$whereSql}
        ORDER BY {$orderBy}
        LIMIT {$limit}
        OFFSET {$offset}
    ";

    $listingStmt = $pdo->prepare($listingSql);
    $listingStmt->execute($params);

    $listings = $listingStmt->fetchAll();

    $imageStmt = $pdo->prepare("
        SELECT
            id,
            image_path,
            uploaded_at
        FROM listing_images
        WHERE listing_id = :listing_id
            AND deleted_at IS NULL
        ORDER BY id ASC
    ");

    foreach ($listings as &$listing) {
        $listing['id'] = (int) $listing['id'];
        $listing['landlord_id'] =
            (int) $listing['landlord_id'];
        $listing['rental_type_id'] =
            (int) $listing['rental_type_id'];
        $listing['price'] =
            (float) $listing['price'];
        $listing['bedroom_no'] =
            $listing['bedroom_no'] !== null
                ? (int) $listing['bedroom_no']
                : null;
        $listing['listing_size'] =
            $listing['listing_size'] !== null
                ? (float) $listing['listing_size']
                : null;
        $listing['occupancy_limit'] =
            $listing['occupancy_limit'] !== null
                ? (int) $listing['occupancy_limit']
                : null;
        $listing['latitude'] =
            $listing['latitude'] !== null
                ? (float) $listing['latitude']
                : null;
        $listing['longitude'] =
            $listing['longitude'] !== null
                ? (float) $listing['longitude']
                : null;

        $imageStmt->execute([
            'listing_id' => $listing['id']
        ]);

        $images = $imageStmt->fetchAll();

        foreach ($images as &$image) {
            $image['id'] = (int) $image['id'];
            $image['image_url'] =
                '/SilipMunti/backend/'
                . $image['image_path'];

            unset($image['image_path']);
        }

        unset($image);

        $listing['images'] = $images;
        $listing['primary_image'] =
            $images[0]['image_url'] ?? null;
    }

    unset($listing);

    echo json_encode([
        'success' => true,
        'message' => 'Listings retrieved successfully.',
        'data' => [
            'total' => $total,
            'listings' => $listings,
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
        'message' => 'Unable to retrieve listings.'
    ]);
}