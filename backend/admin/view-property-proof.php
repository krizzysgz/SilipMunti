<?php
declare(strict_types=1);
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Security-Policy: sandbox');
require_once __DIR__ . '/../middleware/auth.php';
require_role($pdo, ['admin']);
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) { http_response_code(400); exit('Invalid document ID.'); }
$stmt = $pdo->prepare('SELECT stored_filename, mime_type FROM property_supporting_documents WHERE id = :id LIMIT 1');
$stmt->execute(['id' => $id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) { http_response_code(404); exit('Document not found.'); }
$allowed = ['application/pdf', 'image/jpeg', 'image/png'];
if (!in_array($row['mime_type'], $allowed, true) || !preg_match('/^[a-f0-9]{40}\.(pdf|jpg|png)$/', $row['stored_filename'])) {
    http_response_code(404); exit('Document unavailable.');
}
$path = __DIR__ . '/../private_uploads/property_proofs/' . $row['stored_filename'];
if (!is_file($path)) { http_response_code(404); exit('Document unavailable.'); }
header('Content-Type: ' . $row['mime_type']);
header('Content-Disposition: inline; filename="property-document"');
header('X-Frame-Options: DENY');
header('Content-Length: ' . filesize($path));
readfile($path);
