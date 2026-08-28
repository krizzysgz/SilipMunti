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

$user = require_login($pdo);

if (!isset($_FILES['profile_picture'])) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture is required.'
    ]);

    exit;
}

$file = $_FILES['profile_picture'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture upload failed.'
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
        'message' => 'Invalid uploaded profile picture.'
    ]);

    exit;
}

$maximumFileSize = 2 * 1024 * 1024;

if ($file['size'] > $maximumFileSize) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture must not exceed 2 MB.'
    ]);

    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($file['tmp_name']);

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

if ($width > 5000 || $height > 5000) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture dimensions must not exceed 5000 by 5000 pixels.'
    ]);

    exit;
}

$profileStmt = $pdo->prepare("
    SELECT profile_picture
    FROM users
    WHERE id = :user_id
        AND deleted_at IS NULL
    LIMIT 1
");

$profileStmt->execute([
    'user_id' => $user['id']
]);

$profile = $profileStmt->fetch();

if (!$profile) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'User profile not found.'
    ]);

    exit;
}

$uploadDirectory =
    dirname(__DIR__)
    . '/storage/profile-pictures';

if (
    !is_dir($uploadDirectory)
    && !mkdir(
        $uploadDirectory,
        0755,
        true
    )
) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to create upload directory.'
    ]);

    exit;
}

$extension =
    $allowedMimeTypes[$mimeType];

$fileName =
    bin2hex(random_bytes(20))
    . '.'
    . $extension;

$destination =
    $uploadDirectory
    . DIRECTORY_SEPARATOR
    . $fileName;

$relativePath =
    'storage/profile-pictures/'
    . $fileName;

if (
    !move_uploaded_file(
        $file['tmp_name'],
        $destination
    )
) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to upload profile picture.'
    ]);

    exit;
}

try {
    $updateStmt = $pdo->prepare("
        UPDATE users
        SET profile_picture = :profile_picture
        WHERE id = :user_id
            AND deleted_at IS NULL
    ");

    $updateStmt->execute([
        'profile_picture' => $relativePath,
        'user_id' => $user['id']
    ]);
} catch (Throwable $exception) {
    if (is_file($destination)) {
        unlink($destination);
    }

    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to save profile picture.'
    ]);

    exit;
}

$oldPicture =
    $profile['profile_picture'] ?? null;

if (
    $oldPicture
    && str_starts_with(
        $oldPicture,
        'storage/profile-pictures/'
    )
) {
    $oldPath =
        dirname(__DIR__)
        . '/'
        . $oldPicture;

    if (is_file($oldPath)) {
        unlink($oldPath);
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Profile picture uploaded successfully.',
    'data' => [
        'profile_picture' => $relativePath,
        'profile_picture_url' =>
            '/SilipMunti/backend/'
            . $relativePath
    ]
]);