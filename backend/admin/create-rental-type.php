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

$name = trim($data['name'] ?? '');
$description = trim($data['description'] ?? '');

$errors = [];

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
    $checkRentalType = $pdo->prepare(
        'SELECT
            id,
            name,
            deleted_at
         FROM rental_types
         WHERE name = ?
         LIMIT 1'
    );

    $checkRentalType->execute([$name]);

    $existingRentalType = $checkRentalType->fetch();

    if (
        $existingRentalType &&
        $existingRentalType['deleted_at'] === null
    ) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'Rental type already exists.'
        ]);

        exit;
    }

    if ($existingRentalType) {
        $restoreRentalType = $pdo->prepare(
            'UPDATE rental_types
             SET
                description = ?,
                deleted_at = NULL,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );

        $restoreRentalType->execute([
            $description !== '' ? $description : null,
            $existingRentalType['id']
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Rental type restored successfully.',
            'data' => [
                'rental_type_id' =>
                    (int) $existingRentalType['id'],
                'name' => $name,
                'description' =>
                    $description !== ''
                        ? $description
                        : null
            ]
        ]);

        exit;
    }

    $createRentalType = $pdo->prepare(
        'INSERT INTO rental_types (
            name,
            description
         ) VALUES (?, ?)'
    );

    $createRentalType->execute([
        $name,
        $description !== '' ? $description : null
    ]);

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Rental type created successfully.',
        'data' => [
            'rental_type_id' => (int) $pdo->lastInsertId(),
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
        'message' => 'Unable to create rental type.'
    ]);
}