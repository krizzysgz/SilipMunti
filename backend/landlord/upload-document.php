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

$user = require_role($pdo, ['landlord']);

$documentType = trim(
    $_POST['document_type'] ?? ''
);

$allowedDocumentTypes = [
    'barangay_clearance',
    'valid_id',
    'land_title'
];

if (
    !in_array(
        $documentType,
        $allowedDocumentTypes,
        true
    )
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid document type.'
    ]);

    exit;
}

if (!isset($_FILES['document'])) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Document file is required.'
    ]);

    exit;
}

$file = $_FILES['document'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Document upload failed.'
    ]);

    exit;
}

if (
    !is_uploaded_file($file['tmp_name'])
    || $file['size'] < 1
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid uploaded document.'
    ]);

    exit;
}

$maximumFileSize = 5 * 1024 * 1024;

if ($file['size'] > $maximumFileSize) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Document must not exceed 5 MB.'
    ]);

    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($file['tmp_name']);

$allowedMimeTypes = [
    'application/pdf' => 'pdf',
    'image/jpeg' => 'jpg',
    'image/png' => 'png'
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
        'message' => 'Only PDF, JPG, and PNG files are allowed.'
    ]);

    exit;
}

if ($mimeType === 'application/pdf') {
    $handle = fopen($file['tmp_name'], 'rb');
    $signature = $handle
        ? fread($handle, 5)
        : false;

    if ($handle) {
        fclose($handle);
    }

    if ($signature !== '%PDF-') {
        http_response_code(422);

        echo json_encode([
            'success' => false,
            'message' => 'Uploaded file is not a valid PDF.'
        ]);

        exit;
    }
} else {
    $imageInfo = @getimagesize(
        $file['tmp_name']
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
}

try {
    $checkDocument = $pdo->prepare("
        SELECT
            id,
            verification_status
        FROM verification_documents
        WHERE landlord_id = :landlord_id
            AND document_type = :document_type
            AND verification_status IN (
                'pending',
                'approved'
            )
            AND deleted_at IS NULL
        LIMIT 1
    ");

    $checkDocument->execute([
        'landlord_id' => $user['id'],
        'document_type' => $documentType
    ]);

    if ($checkDocument->fetch()) {
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'You already have a pending or approved document of this type.'
        ]);

        exit;
    }

    $uploadDirectory =
        dirname(__DIR__)
        . '/storage/verification-documents';

    if (
        !is_dir($uploadDirectory)
        && !mkdir(
            $uploadDirectory,
            0755,
            true
        )
    ) {
        throw new RuntimeException(
            'Unable to create upload directory.'
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
        'storage/verification-documents/'
        . $fileName;

    if (
        !move_uploaded_file(
            $file['tmp_name'],
            $absolutePath
        )
    ) {
        throw new RuntimeException(
            'Unable to save uploaded document.'
        );
    }

    try {
        $insertDocument = $pdo->prepare("
            INSERT INTO verification_documents (
                landlord_id,
                document_type,
                document_path,
                verification_status
            )
            VALUES (
                :landlord_id,
                :document_type,
                :document_path,
                'pending'
            )
        ");

        $insertDocument->execute([
            'landlord_id' => $user['id'],
            'document_type' => $documentType,
            'document_path' => $databasePath
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
        'message' => 'Verification document uploaded successfully.',
        'data' => [
            'document_id' =>
                (int) $pdo->lastInsertId(),
            'document_type' =>
                $documentType,
            'verification_status' =>
                'pending'
        ]
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to upload verification document.'
    ]);
}