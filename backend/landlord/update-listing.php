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

$landlord = require_approved_landlord($pdo);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

/*
 * Validate types before calling trim() or strtolower().
 */
$textFields = [
    'title',
    'description',
    'address',
    'barangay',
    'availability_status'
];

$typeErrors = [];

foreach ($textFields as $field) {
    if (
        array_key_exists($field, $data)
        && !is_string($data[$field])
        && $data[$field] !== null
    ) {
        $typeErrors[$field] = 'This field must be text.';
    }
}

if ($typeErrors !== []) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Validation failed.',
        'errors' => $typeErrors
    ]);
    exit;
}

$listingId = filter_var(
    $data['listing_id'] ?? null,
    FILTER_VALIDATE_INT
);

$rentalTypeId = filter_var(
    $data['rental_type_id'] ?? null,
    FILTER_VALIDATE_INT
);

$title = trim($data['title'] ?? '');
$description = trim($data['description'] ?? '');
$address = trim($data['address'] ?? '');
$barangay = trim($data['barangay'] ?? '');

$price = filter_var(
    $data['price'] ?? null,
    FILTER_VALIDATE_FLOAT
);

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

$availabilityStatus = strtolower(trim(
    $data['availability_status'] ?? ''
));

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

if ($listingId === false || $listingId < 1) {
    $errors['listing_id'] = 'A valid listing ID is required.';
}

if ($rentalTypeId === false || $rentalTypeId < 1) {
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

if (
    $price === false
    || !is_finite((float) $price)
    || $price <= 0
) {
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
    || !is_finite((float) $latitude)
    || $latitude < -90
    || $latitude > 90
) {
    $errors['latitude'] = 'A valid latitude is required.';
}

if (
    $longitude === false
    || !is_finite((float) $longitude)
    || $longitude < -180
    || $longitude > 180
) {
    $errors['longitude'] = 'A valid longitude is required.';
}

if (
    $bedroomNumber === false
    || ($bedroomNumber !== null && $bedroomNumber < 0)
) {
    $errors['bedroom_no'] = 'Bedroom number must be zero or greater.';
}

if (
    $listingSize === false
    || (
        $listingSize !== null
        && (
            !is_finite((float) $listingSize)
            || $listingSize <= 0
        )
    )
) {
    $errors['listing_size'] = 'Listing size must be greater than zero.';
}

if (
    $occupancyLimit === false
    || ($occupancyLimit !== null && $occupancyLimit < 1)
) {
    $errors['occupancy_limit'] = 'Occupancy limit must be at least one.';
}

if (!in_array(
    $availabilityStatus,
    ['available', 'occupied'],
    true
)) {
    $errors['availability_status'] = 'Select a valid availability status.';
}

/*
 * Each list must contain text items only.
 */
$listFields = [
    'nearby_establishments' => $nearbyEstablishments,
    'transport_routes' => $transportRoutes,
    'amenities' => $amenities
];

foreach ($listFields as $field => $items) {
    if (!is_array($items)) {
        $errors[$field] = 'This field must be a list.';
        continue;
    }

    foreach ($items as $item) {
        if (!is_string($item)) {
            $errors[$field] = 'Each item in this list must be text.';
            break;
        }
    }
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
    $pdo->beginTransaction();

    /*
     * Lock the owned listing while updating it.
     * Ownership comes from the authenticated session.
     */
    $getListing = $pdo->prepare("
        SELECT
            id,
            verification_status
        FROM listings
        WHERE id = :listing_id
            AND landlord_id = :landlord_id
            AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
    ");

    $getListing->execute([
        'listing_id' => $listingId,
        'landlord_id' => $landlord['id']
    ]);

    $currentListing = $getListing->fetch();

    if (!$currentListing) {
        $pdo->rollBack();

        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Listing not found or does not belong to you.'
        ]);
        exit;
    }

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
        $pdo->rollBack();

        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Selected rental type is unavailable.'
        ]);
        exit;
    }

    $nearbyEstablishmentsJson = json_encode(
        array_values($nearbyEstablishments),
        JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );

    $transportRoutesJson = json_encode(
        array_values($transportRoutes),
        JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );

    $amenitiesJson = json_encode(
        array_values($amenities),
        JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );

    $verificationStatus = $currentListing['verification_status'];

    /*
     * verification_status is deliberately excluded.
     * A landlord update must not overwrite an admin decision.
     */
    $updateListing = $pdo->prepare("
        UPDATE listings
        SET
            rental_type_id = :rental_type_id,
            title = :title,
            description = :description,
            price = :price,
            address = :address,
            city = 'Muntinlupa',
            barangay = :barangay,
            latitude = :latitude,
            longitude = :longitude,
            bedroom_no = :bedroom_no,
            listing_size = :listing_size,
            occupancy_limit = :occupancy_limit,
            availability_status = :availability_status,
            nearby_establishments = :nearby_establishments,
            transport_routes = :transport_routes,
            amenities = :amenities,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :listing_id
            AND landlord_id = :landlord_id
            AND deleted_at IS NULL
    ");

    $updateListing->execute([
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
        'availability_status' => $availabilityStatus,
        'nearby_establishments' => $nearbyEstablishmentsJson,
        'transport_routes' => $transportRoutesJson,
        'amenities' => $amenitiesJson,
        'listing_id' => $listingId,
        'landlord_id' => $landlord['id']
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Property details updated successfully.',
        'data' => [
            'listing_id' => (int) $listingId,
            'title' => $title,
            'price' => (float) $price,
            'availability_status' => $availabilityStatus,
            'verification_status' => $verificationStatus
        ]
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to update property listing.'
    ]);
}