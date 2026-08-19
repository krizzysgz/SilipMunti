<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$landlord = require_role($pdo, ['landlord']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$rentalTypeId = filter_var(
    $data['rental_type_id'] ?? null,
    FILTER_VALIDATE_INT
);

$title = trim($data['title'] ?? '');
$description = trim($data['description'] ?? '');
$price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
$address = trim($data['address'] ?? '');
$barangay = trim($data['barangay'] ?? '');
$latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
$longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);

$bedroomNumber = filter_var(
    $data['bedroom_no'] ?? null,
    FILTER_VALIDATE_INT
);

$listingSize = filter_var(
    $data['listing_size'] ?? null,
    FILTER_VALIDATE_FLOAT
);

$occupancyLimit = filter_var(
    $data['occupancy_limit'] ?? null,
    FILTER_VALIDATE_INT
);

$nearbyEstablishments = $data['nearby_establishments'] ?? [];
$transportRoutes = $data['transport_routes'] ?? [];
$amenities = $data['amenities'] ?? [];

$errors = [];

if (!$rentalTypeId || $rentalTypeId < 1) {
    $errors['rental_type_id'] = 'A valid rental type is required.';
}

if ($title === '') {
    $errors['title'] = 'Listing title is required.';
} elseif (mb_strlen($title) > 255) {
    $errors['title'] = 'Listing title must not exceed 255 characters.';
}

if ($description !== '' && mb_strlen($description) > 5000) {
    $errors['description'] = 'Description must not exceed 5000 characters.';
}

if ($price === false || $price <= 0) {
    $errors['price'] = 'A valid price greater than zero is required.';
}

if ($address === '') {
    $errors['address'] = 'Property address is required.';
} elseif (mb_strlen($address) > 255) {
    $errors['address'] = 'Address must not exceed 255 characters.';
}

if ($barangay === '') {
    $errors['barangay'] = 'Barangay is required.';
} elseif (mb_strlen($barangay) > 100) {
    $errors['barangay'] = 'Barangay must not exceed 100 characters.';
}

if (
    $latitude === false ||
    $latitude < -90 ||
    $latitude > 90
) {
    $errors['latitude'] = 'A valid latitude is required.';
}

if (
    $longitude === false ||
    $longitude < -180 ||
    $longitude > 180
) {
    $errors['longitude'] = 'A valid longitude is required.';
}

if (
    $bedroomNumber !== null &&
    $bedroomNumber !== false &&
    $bedroomNumber < 0
) {
    $errors['bedroom_no'] = 'Bedroom number cannot be negative.';
}

if (
    $listingSize !== null &&
    $listingSize !== false &&
    $listingSize <= 0
) {
    $errors['listing_size'] = 'Listing size must be greater than zero.';
}

if (
    $occupancyLimit !== null &&
    $occupancyLimit !== false &&
    $occupancyLimit < 1
) {
    $errors['occupancy_limit'] = 'Occupancy limit must be at least one.';
}

if (!is_array($nearbyEstablishments)) {
    $errors['nearby_establishments'] = 'Nearby establishments must be a list.';
}

if (!is_array($transportRoutes)) {
    $errors['transport_routes'] = 'Transport routes must be a list.';
}

if (!is_array($amenities)) {
    $errors['amenities'] = 'Amenities must be a list.';
}

if ($errors !== []) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Validation failed.',
        'errors' => $errors
    ]);

    exit;
}

try {
    $requiredDocuments = [
        'valid_id',
        'barangay_clearance',
        'land_title'
    ];

    $getApprovedDocuments = $pdo->prepare(
        'SELECT DISTINCT document_type
         FROM verification_documents
         WHERE landlord_id = ?
           AND verification_status = "approved"
           AND deleted_at IS NULL'
    );

    $getApprovedDocuments->execute([$landlord['id']]);

    $approvedDocuments = $getApprovedDocuments->fetchAll(
        PDO::FETCH_COLUMN
    );

    $missingDocuments = array_values(
        array_diff($requiredDocuments, $approvedDocuments)
    );

    if ($missingDocuments !== []) {
        http_response_code(403);

        echo json_encode([
            'success' => false,
            'message' => 'Complete landlord verification is required before creating a listing.',
            'data' => [
                'missing_documents' => $missingDocuments
            ]
        ]);

        exit;
    }

    $checkRentalType = $pdo->prepare(
        'SELECT id
         FROM rental_types
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $checkRentalType->execute([$rentalTypeId]);

    if (!$checkRentalType->fetch()) {
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Selected rental type is unavailable.'
        ]);

        exit;
    }

    $nearbyEstablishmentsJson = json_encode(
        array_values($nearbyEstablishments),
        JSON_UNESCAPED_UNICODE
    );

    $transportRoutesJson = json_encode(
        array_values($transportRoutes),
        JSON_UNESCAPED_UNICODE
    );

    $amenitiesJson = json_encode(
        array_values($amenities),
        JSON_UNESCAPED_UNICODE
    );

    $createListing = $pdo->prepare(
        'INSERT INTO listings (
            landlord_id,
            rental_type_id,
            title,
            description,
            price,
            address,
            city,
            barangay,
            latitude,
            longitude,
            bedroom_no,
            listing_size,
            occupancy_limit,
            availability_status,
            verification_status,
            nearby_establishments,
            transport_routes,
            amenities
         ) VALUES (
            ?, ?, ?, ?, ?, ?, "Muntinlupa", ?, ?, ?, ?, ?, ?,
            "available", "pending", ?, ?, ?
         )'
    );

    $createListing->execute([
        $landlord['id'],
        $rentalTypeId,
        $title,
        $description !== '' ? $description : null,
        $price,
        $address,
        $barangay,
        $latitude,
        $longitude,
        $bedroomNumber !== false ? $bedroomNumber : null,
        $listingSize !== false ? $listingSize : null,
        $occupancyLimit !== false ? $occupancyLimit : null,
        $nearbyEstablishmentsJson,
        $transportRoutesJson,
        $amenitiesJson
    ]);

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Property listing submitted successfully and is awaiting admin verification.',
        'data' => [
            'listing_id' => (int) $pdo->lastInsertId(),
            'title' => $title,
            'price' => (float) $price,
            'city' => 'Muntinlupa',
            'barangay' => $barangay,
            'availability_status' => 'available',
            'verification_status' => 'pending'
        ]
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to create property listing.'
    ]);
}