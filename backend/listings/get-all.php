<?php

header('Content-Type: application/json');

require_once '../config/database.php';

$search = trim($_GET['search'] ?? '');
$barangay = trim($_GET['barangay'] ?? '');
$rentalTypeId = $_GET['rental_type_id'] ?? '';
$minPrice = $_GET['min_price'] ?? '';
$maxPrice = $_GET['max_price'] ?? '';
$bedroomNo = $_GET['bedroom_no'] ?? '';
$sort = $_GET['sort'] ?? 'newest';

$allowedSorts = ['newest', 'price_low', 'price_high'];

if (!in_array($sort, $allowedSorts, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid sorting option.'
    ]);
    exit;
}

if ($rentalTypeId !== '' && (!ctype_digit((string) $rentalTypeId) || (int) $rentalTypeId < 1)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid rental type.'
    ]);
    exit;
}

if ($minPrice !== '' && (!is_numeric($minPrice) || (float) $minPrice < 0)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid minimum price.'
    ]);
    exit;
}

if ($maxPrice !== '' && (!is_numeric($maxPrice) || (float) $maxPrice < 0)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid maximum price.'
    ]);
    exit;
}

if ($minPrice !== '' && $maxPrice !== '' && (float) $minPrice > (float) $maxPrice) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Minimum price cannot be greater than maximum price.'
    ]);
    exit;
}

if ($bedroomNo !== '' && (!ctype_digit((string) $bedroomNo) || (int) $bedroomNo < 0)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid number of bedrooms.'
    ]);
    exit;
}

$sql = "
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
        CONCAT(u.first_name, ' ', u.last_name) AS landlord_name
    FROM listings l
    INNER JOIN users u
        ON u.id = l.landlord_id
    INNER JOIN rental_types rt
        ON rt.id = l.rental_type_id
    WHERE l.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND rt.deleted_at IS NULL
        AND l.verification_status = 'verified'
        AND l.availability_status = 'available'
";

$params = [];

if ($search !== '') {
    $sql .= "
        AND (
            l.title LIKE :search
            OR l.description LIKE :search
            OR l.address LIKE :search
            OR l.city LIKE :search
            OR l.barangay LIKE :search
            OR rt.name LIKE :search
        )
    ";

    $params['search'] = '%' . $search . '%';
}

if ($barangay !== '') {
    $sql .= " AND l.barangay = :barangay";
    $params['barangay'] = $barangay;
}

if ($rentalTypeId !== '') {
    $sql .= " AND l.rental_type_id = :rental_type_id";
    $params['rental_type_id'] = (int) $rentalTypeId;
}

if ($minPrice !== '') {
    $sql .= " AND l.price >= :min_price";
    $params['min_price'] = (float) $minPrice;
}

if ($maxPrice !== '') {
    $sql .= " AND l.price <= :max_price";
    $params['max_price'] = (float) $maxPrice;
}

if ($bedroomNo !== '') {
    $sql .= " AND l.bedroom_no = :bedroom_no";
    $params['bedroom_no'] = (int) $bedroomNo;
}

if ($sort === 'price_low') {
    $sql .= " ORDER BY l.price ASC";
} elseif ($sort === 'price_high') {
    $sql .= " ORDER BY l.price DESC";
} else {
    $sql .= " ORDER BY l.created_at DESC";
}

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$listings = $stmt->fetchAll();

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
    $imageStmt->execute([
        'listing_id' => $listing['id']
    ]);

    $images = $imageStmt->fetchAll();

    foreach ($images as &$image) {
        $image['image_url'] =
            '/SilipMunti/backend/' . $image['image_path'];

        unset($image['image_path']);
    }

    $listing['images'] = $images;
    $listing['primary_image'] =
        $images[0]['image_url'] ?? null;
}

echo json_encode([
    'success' => true,
    'message' => 'Listings retrieved successfully.',
    'data' => [
        'total' => count($listings),
        'listings' => $listings
    ]
]);