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

$landlord = require_role($pdo, ['landlord']);

$listingId = filter_var(
    $_POST['listing_id'] ?? null,
    FILTER_VALIDATE_INT
);

if (!$listingId || $listingId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'A valid listing ID is required.'
    ]);

    exit;
}

if (!isset($_FILES['image'])) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Listing image is required.'
    ]);

    exit;
}

$image = $_FILES['image'];

if ($image['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Image upload failed.'
    ]);

    exit;
}

if (
    !is_uploaded_file($image['tmp_name'])
    || $image['size'] < 1
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid uploaded image.'
    ]);

    exit;
}

$maximumFileSize = 5 * 1024 * 1024;

if ($image['size'] > $maximumFileSize) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Image must not exceed 5 MB.'
    ]);

    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($image['tmp_name']);

$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp'
];

if (
    !$mimeType
    || !array_key_exists(
        $mimeType,
        $allowedMimeTypes
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Only JPG, PNG, and WebP images are allowed.'
    ]);

    exit;
}

$imageInfo = @getimagesize(
    $image['tmp_name']
);

if ($imageInfo === false) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Uploaded file is not a valid image.'
    ]);

    exit;
}

[$width, $height] = $imageInfo;

if ($width > 8000 || $height > 8000) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Image dimensions must not exceed 8000 by 8000 pixels.'
    ]);

    exit;
}

try {
    $getListing = $pdo->prepare("
        SELECT
            id,
            title
        FROM listings
        WHERE id = :listing_id
            AND landlord_id = :landlord_id
            AND deleted_at IS NULL
        LIMIT 1
    ");

    $getListing->execute([
        'listing_id' => $listingId,
        'landlord_id' => $landlord['id']
    ]);

    if (!$getListing->fetch()) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Listing not found or does not belong to you.'
        ]);

        exit;
    }

    $countImages = $pdo->prepare("
        SELECT COUNT(*)
        FROM listing_images
        WHERE listing_id = :listing_id
            AND deleted_at IS NULL
    ");

    $countImages->execute([
        'listing_id' => $listingId
    ]);

    $imageCount =
        (int) $countImages->fetchColumn();

    if ($imageCount >= 10) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'A listing can only have up to 10 images.'
        ]);

        exit;
    }

    $uploadDirectory =
        dirname(__DIR__)
        . '/storage/listing-images';

    if (
        !is_dir($uploadDirectory)
        && !mkdir(
            $uploadDirectory,
            0755,
            true
        )
    ) {
        throw new RuntimeException(
            'Unable to create image directory.'
        );
    }

    $extension =
        $allowedMimeTypes[$mimeType];

    $fileName =
        bin2hex(random_bytes(20))
        . '.'
        . $extension;

    $absolutePath =
        $uploadDirectory
        . DIRECTORY_SEPARATOR
        . $fileName;

    $databasePath =
        'storage/listing-images/'
        . $fileName;

    if (
        !move_uploaded_file(
            $image['tmp_name'],
            $absolutePath
        )
    ) {
        throw new RuntimeException(
            'Unable to save listing image.'
        );
    }

    try {
        $createImage = $pdo->prepare("
            INSERT INTO listing_images (
                listing_id,
                image_path
            )
            VALUES (
                :listing_id,
                :image_path
            )
        ");

        $createImage->execute([
            'listing_id' => $listingId,
            'image_path' => $databasePath
        ]);
    } catch (Throwable $exception) {
        if (is_file($absolutePath)) {
            unlink($absolutePath);
        }

        throw $exception;
    }

    http_response_code(201);

    echo json_encode([
        'success' => true,
        'message' => 'Listing image uploaded successfully.',
        'data' => [
            'image_id' =>
                (int) $pdo->lastInsertId(),
            'listing_id' =>
                (int) $listingId,
            'image_number' =>
                $imageCount + 1,
            'image_url' =>
                '/SilipMunti/backend/'
                . $databasePath
        ]
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to upload listing image.'
    ]);
}