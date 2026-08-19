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

$admin = require_role($pdo, ['admin']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$rentalTypeId = filter_var(
    $data['rental_type_id'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$rentalTypeId || $rentalTypeId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'A valid rental type ID is required.'
    ]);

    exit;
}

try {
    $getRentalType = $pdo->prepare(
        'SELECT
            id,
            name
         FROM rental_types
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getRentalType->execute([$rentalTypeId]);

    $rentalType = $getRentalType->fetch();

    if (!$rentalType) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Rental type not found.'
        ]);

        exit;
    }

    $checkListings = $pdo->prepare(
        'SELECT COUNT(*)
         FROM listings
         WHERE rental_type_id = ?
           AND deleted_at IS NULL'
    );

    $checkListings->execute([$rentalTypeId]);

    $listingCount = (int) $checkListings->fetchColumn();

    if ($listingCount > 0) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'This rental type cannot be deleted because it is currently used by property listings.',
            'data' => [
                'listing_count' => $listingCount
            ]
        ]);

        exit;
    }

    $deleteRentalType = $pdo->prepare(
        'UPDATE rental_types
         SET
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );

    $deleteRentalType->execute([$rentalTypeId]);

    echo json_encode([
        'success' => true,
        'message' => 'Rental type deleted successfully.',
        'data' => [
            'rental_type_id' => (int) $rentalType['id'],
            'name' => $rentalType['name']
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to delete rental type.'
    ]);
}