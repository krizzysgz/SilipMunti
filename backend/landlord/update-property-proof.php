<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
require_once __DIR__ . '/../middleware/auth.php';

function proof_response(int $status, bool $success, string $message, array $extra = []): never {
    http_response_code($status);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') proof_response(405, false, 'Method not allowed.');
// Existing auth middleware/session security must validate this request, including CSRF.
$landlord = require_role($pdo, ['landlord']);
$landlordId = (int)($landlord['id'] ?? 0);
if (!$landlordId) proof_response(401, false, 'Invalid landlord session.');
$listingId = filter_var($_POST['listing_id'] ?? null, FILTER_VALIDATE_INT);
$documentType = (string)($_POST['document_type'] ?? '');
if (!$listingId || !in_array($documentType, ['tct', 'cct', 'authorization', 'other'], true)) {
    proof_response(422, false, 'Valid listing and document type are required.');
}
$statement = $pdo->prepare('SELECT id FROM listings WHERE id = :id AND landlord_id = :landlord AND deleted_at IS NULL LIMIT 1');
$statement->execute(['id' => $listingId, 'landlord' => $landlordId]);
if (!$statement->fetch()) proof_response(403, false, 'You do not own this listing.');
$file = $_FILES['document'] ?? null;
if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    proof_response(422, false, 'Please upload a valid supporting document.');
}
$size = (int)$file['size'];
if ($size < 1 || $size > 5 * 1024 * 1024) proof_response(422, false, 'Document must be 5 MB or less.');
$tmp = (string)$file['tmp_name'];
if (!is_uploaded_file($tmp)) proof_response(422, false, 'Invalid uploaded file.');
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
$extensionByMime = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'];
if (!isset($extensionByMime[$mime])) proof_response(422, false, 'Only PDF, JPG, and PNG are supported.');
if ($mime === 'application/pdf') {
    $handle = fopen($tmp, 'rb');
    $signature = $handle ? fread($handle, 5) : false;
    if ($handle) fclose($handle);
    if ($signature !== '%PDF-') proof_response(422, false, 'Invalid PDF file.');
} else if (@getimagesize($tmp) === false) {
    proof_response(422, false, 'Invalid image file.');
}
$dir = __DIR__ . '/../private_uploads/property_proofs';
if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
    proof_response(500, false, 'Secure document storage is unavailable.');
}
// Deployment requirement: block direct HTTP access to backend/private_uploads in server configuration.
$stored = bin2hex(random_bytes(20)) . '.' . $extensionByMime[$mime];
$dest = $dir . '/' . $stored;
if (!move_uploaded_file($tmp, $dest)) proof_response(500, false, 'Could not store document.');
@chmod($dest, 0600);
try {
    $statement = $pdo->prepare('INSERT INTO property_supporting_documents
      (listing_id, landlord_id, document_type, original_filename, stored_filename, mime_type, file_size)
      VALUES (:listing, :landlord, :type, :original, :stored, :mime, :size)');
    $statement->execute([
        'listing' => $listingId,
        'landlord' => $landlordId,
        'type' => $documentType,
        'original' => mb_substr(basename((string)$file['name']), 0, 255),
        'stored' => $stored, 'mime' => $mime, 'size' => $size,
    ]);
} catch (Throwable $exception) {
    @unlink($dest);
    error_log('Property document upload failed: ' . $exception->getMessage());
    proof_response(500, false, 'Unable to save supporting document record.');
}
proof_response(201, true, 'Supporting document submitted for review.', [
    'data' => ['document_id' => (int)$pdo->lastInsertId(), 'status' => 'pending']
]);
