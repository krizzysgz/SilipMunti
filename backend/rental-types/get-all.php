<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

try {
    $getRentalTypes = $pdo->query(
        'SELECT
            id,
            name,
            description,
            created_at,
            updated_at
         FROM rental_types
         WHERE deleted_at IS NULL
         ORDER BY name ASC'
    );

    $rentalTypes = $getRentalTypes->fetchAll();

    echo json_encode([
        'success' => true,
        'message' => 'Rental types retrieved successfully.',
        'data' => [
            'total' => count($rentalTypes),
            'rental_types' => $rentalTypes
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve rental types.'
    ]);
}