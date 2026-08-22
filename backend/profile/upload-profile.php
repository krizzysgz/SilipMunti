<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_login($pdo);

if (
    !isset($_FILES['profile_picture'])
    || $_FILES['profile_picture']['error'] !== UPLOAD_ERR_OK
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture is required.'
    ]);
    exit;
}

$file = $_FILES['profile_picture'];

if ($file['size'] > 2 * 1024 * 1024) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Profile picture must not exceed 2 MB.'
    ]);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($file['tmp_name']);

$allowedTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp'
];

if (!isset($allowedTypes[$mimeType])) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Only JPG, PNG, and WebP images are allowed.'
    ]);
    exit;
}

$uploadDirectory = dirname(__DIR__) . '/storage/profile-pictures';

if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true)) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to create upload directory.'
    ]);
    exit;
}

$extension = $allowedTypes[$mimeType];
$fileName = bin2hex(random_bytes(16)) . '.' . $extension;
$destination = $uploadDirectory . '/' . $fileName;
$relativePath = 'storage/profile-pictures/' . $fileName;

if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to upload profile picture.'
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
} catch (PDOException $e) {
    if (is_file($destination)) {
        unlink($destination);
    }

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to save profile picture.'
    ]);
    exit;
}

$oldPicture = $profile['profile_picture'] ?? null;

if (
    $oldPicture
    && str_starts_with($oldPicture, 'storage/profile-pictures/')
) {
    $oldPath = dirname(__DIR__) . '/' . $oldPicture;

    if (is_file($oldPath)) {
        unlink($oldPath);
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Profile picture uploaded successfully.',
    'data' => [
        'profile_picture' => $relativePath,
        'profile_picture_url' => '/SilipMunti/backend/' . $relativePath
    ]
]);