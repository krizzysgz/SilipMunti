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

$imageId = filter_var(
    $data['image_id'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$imageId || $imageId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'A valid image ID is required.'
    ]);

    exit;
}

try {
    $getImage = $pdo->prepare(
        'SELECT
            li.id,
            li.listing_id,
            li.image_path
         FROM listing_images li
         INNER JOIN listings l
            ON l.id = li.listing_id
         WHERE li.id = ?
           AND l.landlord_id = ?
           AND li.deleted_at IS NULL
           AND l.deleted_at IS NULL
         LIMIT 1'
    );

    $getImage->execute([
        $imageId,
        $landlord['id']
    ]);

    $image = $getImage->fetch();

    if (!$image) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Image not found or does not belong to your listing.'
        ]);

        exit;
    }

    $deleteImage = $pdo->prepare(
        'UPDATE listing_images
         SET
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?'
    );

    $deleteImage->execute([$imageId]);

    echo json_encode([
        'success' => true,
        'message' => 'Listing image deleted successfully.',
        'data' => [
            'image_id' => (int) $image['id'],
            'listing_id' => (int) $image['listing_id']
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to delete listing image.'
    ]);
}