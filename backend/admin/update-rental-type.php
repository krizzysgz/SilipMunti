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

$name = trim($data['name'] ?? '');
$description = trim($data['description'] ?? '');

$errors = [];

if (!$rentalTypeId || $rentalTypeId < 1) {
    $errors['rental_type_id'] = 'A valid rental type ID is required.';
}

if ($name === '') {
    $errors['name'] = 'Rental type name is required.';
} elseif (mb_strlen($name) > 100) {
    $errors['name'] = 'Rental type name must not exceed 100 characters.';
}

if (mb_strlen($description) > 1000) {
    $errors['description'] = 'Description must not exceed 1000 characters.';
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
    $getRentalType = $pdo->prepare(
        'SELECT id
         FROM rental_types
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getRentalType->execute([$rentalTypeId]);

    if (!$getRentalType->fetch()) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Rental type not found.'
        ]);

        exit;
    }

    $checkName = $pdo->prepare(
        'SELECT id
         FROM rental_types
         WHERE name = ?
           AND id != ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $checkName->execute([
        $name,
        $rentalTypeId
    ]);

    if ($checkName->fetch()) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'Another rental type already uses this name.'
        ]);

        exit;
    }

    $updateRentalType = $pdo->prepare(
        'UPDATE rental_types
         SET
            name = ?,
            description = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );

    $updateRentalType->execute([
        $name,
        $description !== '' ? $description : null,
        $rentalTypeId
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'Rental type updated successfully.',
        'data' => [
            'rental_type_id' => (int) $rentalTypeId,
            'name' => $name,
            'description' =>
                $description !== ''
                    ? $description
                    : null
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to update rental type.'
    ]);
}