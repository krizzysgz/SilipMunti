<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$admin = require_role($pdo, ['admin']);

$verificationStatus =
    trim($_GET['verification_status'] ?? 'all');

$availabilityStatus =
    trim($_GET['availability_status'] ?? 'all');

$recordStatus =
    trim($_GET['record_status'] ?? 'active');

$search = trim($_GET['search'] ?? '');

$allowedVerificationStatuses = [
    'all',
    'pending',
    'verified',
    'rejected'
];

$allowedAvailabilityStatuses = [
    'all',
    'available',
    'occupied'
];

$allowedRecordStatuses = [
    'all',
    'active',
    'deleted'
];

if (
    !in_array(
        $verificationStatus,
        $allowedVerificationStatuses,
        true
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid verification status filter.'
    ]);

    exit;
}

if (
    !in_array(
        $availabilityStatus,
        $allowedAvailabilityStatuses,
        true
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid availability status filter.'
    ]);

    exit;
}

if (
    !in_array(
        $recordStatus,
        $allowedRecordStatuses,
        true
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid record status filter.'
    ]);

    exit;
}

try {
    $conditions = [];
    $parameters = [];

    if ($verificationStatus !== 'all') {
        $conditions[] = 'l.verification_status = ?';
        $parameters[] = $verificationStatus;
    }

    if ($availabilityStatus !== 'all') {
        $conditions[] = 'l.availability_status = ?';
        $parameters[] = $availabilityStatus;
    }

    if ($recordStatus === 'active') {
        $conditions[] = 'l.deleted_at IS NULL';
    }

    if ($recordStatus === 'deleted') {
        $conditions[] = 'l.deleted_at IS NOT NULL';
    }

    if ($search !== '') {
        $conditions[] = '(
            l.title LIKE ?
            OR l.address LIKE ?
            OR l.barangay LIKE ?
            OR u.first_name LIKE ?
            OR u.last_name LIKE ?
            OR u.email LIKE ?
        )';

        $searchValue = '%' . $search . '%';

        for ($index = 0; $index < 6; $index++) {
            $parameters[] = $searchValue;
        }
    }

    $whereClause = '';

    if ($conditions !== []) {
        $whereClause =
            'WHERE ' . implode(' AND ', $conditions);
    }

    $getListings = $pdo->prepare(
        'SELECT
            l.id,
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
            l.deleted_at,
            u.id AS landlord_id,
            u.first_name AS landlord_first_name,
            u.last_name AS landlord_last_name,
            u.email AS landlord_email,
            u.phone_number AS landlord_phone,
            u.deleted_at AS landlord_deleted_at
         FROM listings l
         INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
         INNER JOIN users u
            ON u.id = l.landlord_id
         ' . $whereClause . '
         ORDER BY l.created_at DESC'
    );

    $getListings->execute($parameters);

    $listings = $getListings->fetchAll();

    $getImages = $pdo->query(
        'SELECT
            id,
            listing_id,
            image_path,
            uploaded_at
         FROM listing_images
         WHERE deleted_at IS NULL
         ORDER BY id ASC'
    );

    $images = $getImages->fetchAll();
    $imagesByListing = [];

    $isHttps =
        isset($_SERVER['HTTPS']) &&
        $_SERVER['HTTPS'] === 'on';

    $scheme = $isHttps ? 'https' : 'http';

    $backendPath = str_replace(
        '\\',
        '/',
        dirname(dirname($_SERVER['SCRIPT_NAME']))
    );

    $backendUrl =
        $scheme .
        '://' .
        $_SERVER['HTTP_HOST'] .
        rtrim($backendPath, '/');

    foreach ($images as $image) {
        $listingId = (int) $image['listing_id'];

        $imagesByListing[$listingId][] = [
            'id' => (int) $image['id'],
            'image_url' =>
                $backendUrl . '/' . $image['image_path'],
            'uploaded_at' => $image['uploaded_at']
        ];
    }

    foreach ($listings as &$listing) {
        $listingId = (int) $listing['id'];

        $nearbyEstablishments = json_decode(
            $listing['nearby_establishments'] ?? '[]',
            true
        );

        $transportRoutes = json_decode(
            $listing['transport_routes'] ?? '[]',
            true
        );

        $amenities = json_decode(
            $listing['amenities'] ?? '[]',
            true
        );

        $listing['id'] = $listingId;
        $listing['rental_type_id'] =
            (int) $listing['rental_type_id'];
        $listing['landlord_id'] =
            (int) $listing['landlord_id'];
        $listing['price'] =
            (float) $listing['price'];
        $listing['latitude'] =
            (float) $listing['latitude'];
        $listing['longitude'] =
            (float) $listing['longitude'];

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

        $listing['nearby_establishments'] =
            is_array($nearbyEstablishments)
                ? $nearbyEstablishments
                : [];

        $listing['transport_routes'] =
            is_array($transportRoutes)
                ? $transportRoutes
                : [];

        $listing['amenities'] =
            is_array($amenities)
                ? $amenities
                : [];

        $listing['record_status'] =
            $listing['deleted_at'] === null
                ? 'active'
                : 'deleted';

        $listing['landlord_status'] =
            $listing['landlord_deleted_at'] === null
                ? 'active'
                : 'deleted';

        $listing['images'] =
            $imagesByListing[$listingId] ?? [];

        unset($listing['landlord_deleted_at']);
    }

    unset($listing);

    echo json_encode([
        'success' => true,
        'message' => 'Property listings retrieved successfully.',
        'data' => [
            'total' => count($listings),
            'filters' => [
                'verification_status' =>
                    $verificationStatus,
                'availability_status' =>
                    $availabilityStatus,
                'record_status' =>
                    $recordStatus,
                'search' => $search
            ],
            'listings' => $listings
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve property listings.'
    ]);
}