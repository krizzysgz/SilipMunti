<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$landlord = require_verified_landlord($pdo);

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

$price = filter_var(
    $data['price'] ?? null,
    FILTER_VALIDATE_FLOAT
);

$address = trim($data['address'] ?? '');
$barangay = trim($data['barangay'] ?? '');

$latitude = filter_var(
    $data['latitude'] ?? null,
    FILTER_VALIDATE_FLOAT
);

$longitude = filter_var(
    $data['longitude'] ?? null,
    FILTER_VALIDATE_FLOAT
);

$bedroomValue = $data['bedroom_no'] ?? null;
$listingSizeValue = $data['listing_size'] ?? null;
$occupancyValue = $data['occupancy_limit'] ?? null;

$bedroomNumber = (
    $bedroomValue === null || $bedroomValue === ''
)
    ? null
    : filter_var($bedroomValue, FILTER_VALIDATE_INT);

$listingSize = (
    $listingSizeValue === null || $listingSizeValue === ''
)
    ? null
    : filter_var($listingSizeValue, FILTER_VALIDATE_FLOAT);

$occupancyLimit = (
    $occupancyValue === null || $occupancyValue === ''
)
    ? null
    : filter_var($occupancyValue, FILTER_VALIDATE_INT);

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
    $latitude === false
    || $latitude < -90
    || $latitude > 90
) {
    $errors['latitude'] = 'A valid latitude is required.';
}

if (
    $longitude === false
    || $longitude < -180
    || $longitude > 180
) {
    $errors['longitude'] = 'A valid longitude is required.';
}

if (
    $bedroomNumber === false
    || ($bedroomNumber !== null && $bedroomNumber < 0)
) {
    $errors['bedroom_no'] =
        'Bedroom number must be zero or greater.';
}

if (
    $listingSize === false
    || ($listingSize !== null && $listingSize <= 0)
) {
    $errors['listing_size'] =
        'Listing size must be greater than zero.';
}

if (
    $occupancyLimit === false
    || ($occupancyLimit !== null && $occupancyLimit < 1)
) {
    $errors['occupancy_limit'] =
        'Occupancy limit must be at least one.';
}

if (!is_array($nearbyEstablishments)) {
    $errors['nearby_establishments'] =
        'Nearby establishments must be a list.';
}

if (!is_array($transportRoutes)) {
    $errors['transport_routes'] =
        'Transport routes must be a list.';
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
    $checkRentalType = $pdo->prepare("
        SELECT id
        FROM rental_types
        WHERE id = :rental_type_id
            AND deleted_at IS NULL
        LIMIT 1
    ");

    $checkRentalType->execute([
        'rental_type_id' => $rentalTypeId
    ]);

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

    if (
        $nearbyEstablishmentsJson === false
        || $transportRoutesJson === false
        || $amenitiesJson === false
    ) {
        throw new RuntimeException(
            'Unable to encode listing information.'
        );
    }

    $createListing = $pdo->prepare("
        INSERT INTO listings (
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
        )
        VALUES (
            :landlord_id,
            :rental_type_id,
            :title,
            :description,
            :price,
            :address,
            'Muntinlupa',
            :barangay,
            :latitude,
            :longitude,
            :bedroom_no,
            :listing_size,
            :occupancy_limit,
            'available',
            'verified',
            :nearby_establishments,
            :transport_routes,
            :amenities
        )
    ");

    $createListing->execute([
        'landlord_id' => $landlord['id'],
        'rental_type_id' => $rentalTypeId,
        'title' => $title,
        'description' => $description !== '' ? $description : null,
        'price' => $price,
        'address' => $address,
        'barangay' => $barangay,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'bedroom_no' => $bedroomNumber,
        'listing_size' => $listingSize,
        'occupancy_limit' => $occupancyLimit,
        'nearby_establishments' => $nearbyEstablishmentsJson,
        'transport_routes' => $transportRoutesJson,
        'amenities' => $amenitiesJson
    ]);

    $listingId = (int) $pdo->lastInsertId();

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Property listing created successfully.',
        'data' => [
            'listing_id' => $listingId,
            'title' => $title,
            'price' => (float) $price,
            'city' => 'Muntinlupa',
            'barangay' => $barangay,
            'availability_status' => 'available',
            'verification_status' => 'verified'
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