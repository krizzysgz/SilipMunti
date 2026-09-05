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

$listingId = $_GET['id'] ?? '';

if (!ctype_digit((string) $listingId) || (int) $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid listing ID is required.'
    ]);
    exit;
}

$stmt = $pdo->prepare("
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
        l.verification_status,
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
    WHERE l.id = :listing_id
        AND l.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND rt.deleted_at IS NULL
        AND l.verification_status = 'verified'
        AND l.availability_status = 'available'
    LIMIT 1
");

$stmt->execute([
    'listing_id' => (int) $listingId
]);

$listing = $stmt->fetch();

if (!$listing) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Listing not found.'
    ]);
    exit;
}

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

$imageStmt->execute([
    'listing_id' => $listing['id']
]);

$images = $imageStmt->fetchAll();

foreach ($images as &$image) {
    $image['id'] = (int) $image['id'];
    $imagePath = $image['image_path'];

    if (
        preg_match('/^https?:\/\//i', $imagePath)
        || str_starts_with($imagePath, '/')
    ) {
        $image['image_url'] = $imagePath;
    } else {
        $image['image_url'] =
            '/SilipMunti/backend/' . ltrim($imagePath, '/');
    }

    unset($image['image_path']);
}

unset($image);

$listing['images'] = $images;
$listing['primary_image'] = $images[0]['image_url'] ?? null;

echo json_encode([
    'success' => true,
    'message' => 'Listing retrieved successfully.',
    'data' => [
        'listing' => $listing
    ]
]);
