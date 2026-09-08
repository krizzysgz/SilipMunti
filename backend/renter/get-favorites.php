<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

$stmt = $pdo->prepare("
    SELECT
        f.id AS favorite_id,
        f.saved_at,
        l.id AS listing_id,
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
        l.rental_type_id,
        rt.name AS rental_type,
        CONCAT(u.first_name, ' ', u.last_name) AS landlord_name
    FROM favorites f
    INNER JOIN listings l
        ON l.id = f.listing_id
    INNER JOIN users u
        ON u.id = l.landlord_id
    INNER JOIN rental_types rt
        ON rt.id = l.rental_type_id
    WHERE f.renter_id = :renter_id
        AND l.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.landlord_status = 'approved'
        AND rt.deleted_at IS NULL
        AND l.verification_status = 'verified'
    ORDER BY f.saved_at DESC
");

$stmt->execute([
    'renter_id' => $renter['id']
]);

$favorites = $stmt->fetchAll();

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

foreach ($favorites as &$favorite) {
    $favorite['favorite_id'] = (int) $favorite['favorite_id'];
    $favorite['listing_id'] = (int) $favorite['listing_id'];
    $favorite['rental_type_id'] = (int) $favorite['rental_type_id'];
    $favorite['price'] = (float) $favorite['price'];

    $imageStmt->execute([
        'listing_id' => $favorite['listing_id']
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

    $favorite['images'] = $images;
    $favorite['primary_image'] = $images[0]['image_url'] ?? null;
}

unset($favorite);

echo json_encode([
    'success' => true,
    'message' => 'Favorites retrieved successfully.',
    'data' => [
        'total' => count($favorites),
        'favorites' => $favorites
    ]
]);
