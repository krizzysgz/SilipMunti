<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$user = require_role($pdo, ['admin']);

$documentId = filter_input(
    INPUT_GET,
    'id',
    FILTER_VALIDATE_INT
);

if (!$documentId || $documentId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'A valid document ID is required.'
    ]);

    exit;
}

try {
    $getDocument = $pdo->prepare(
        'SELECT
            id,
            document_type,
            document_path,
            verification_status
         FROM verification_documents
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1'
    );

    $getDocument->execute([$documentId]);

    $document = $getDocument->fetch();

    if (!$document) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Document not found.'
        ]);

        exit;
    }

    $storageDirectory = realpath(
        __DIR__ . '/../storage/verification-documents'
    );

    if ($storageDirectory === false) {
        throw new RuntimeException(
            'Verification document storage is unavailable.'
        );
    }

    $fileName = basename($document['document_path']);
    $filePath = $storageDirectory . DIRECTORY_SEPARATOR . $fileName;
    $realFilePath = realpath($filePath);

    if (
        $realFilePath === false ||
        !is_file($realFilePath) ||
        !str_starts_with(
            $realFilePath,
            $storageDirectory . DIRECTORY_SEPARATOR
        )
    ) {
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Document file not found.'
        ]);

        exit;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($realFilePath);

    $allowedMimeTypes = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png'
    ];

    if (!array_key_exists($mimeType, $allowedMimeTypes)) {
        http_response_code(415);

        echo json_encode([
            'success' => false,
            'message' => 'Unsupported document format.'
        ]);

        exit;
    }

    $extension = $allowedMimeTypes[$mimeType];
    $displayName = 'document-' . $document['id'] . '.' . $extension;

    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($realFilePath));
    header(
        'Content-Disposition: inline; filename="' .
        $displayName .
        '"'
    );
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');

    readfile($realFilePath);
    exit;
} catch (Throwable $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve document file.'
    ]);
}