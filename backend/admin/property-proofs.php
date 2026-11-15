<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
require_once __DIR__ . '/../middleware/auth.php';
function admin_proof_response(int $status, bool $success, string $message, array $extra = []): never {
    http_response_code($status);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
}
$admin = require_role($pdo, ['admin']);
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query('SELECT p.id, p.listing_id, p.document_type, p.original_filename, p.verification_status,
        p.rejection_reason, p.created_at, p.reviewed_at, l.title AS listing_title,
        CONCAT(u.first_name, " ", u.last_name) AS landlord_name
      FROM property_supporting_documents p
      JOIN listings l ON l.id = p.listing_id
      JOIN users u ON u.id = p.landlord_id
      ORDER BY (p.verification_status = "pending") DESC, p.created_at DESC LIMIT 250');
    admin_proof_response(200, true, 'OK', ['data' => ['documents' => $stmt->fetchAll(PDO::FETCH_ASSOC)]]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') admin_proof_response(405, false, 'Method not allowed.');
$data = json_decode(file_get_contents('php://input'), true);
$id = filter_var($data['document_id'] ?? null, FILTER_VALIDATE_INT);
$status = (string)($data['status'] ?? '');
$reason = trim((string)($data['reason'] ?? ''));
if (!$id || !in_array($status, ['approved', 'rejected'], true)) admin_proof_response(422, false, 'Invalid review request.');
if ($status === 'rejected' && ($reason === '' || mb_strlen($reason) > 500)) admin_proof_response(422, false, 'Provide a reason (maximum 500 characters).');
$stmt = $pdo->prepare('UPDATE property_supporting_documents
    SET verification_status = :status, rejection_reason = :reason, reviewed_by = :admin, reviewed_at = NOW()
    WHERE id = :id AND verification_status = "pending"');
$stmt->execute(['status' => $status, 'reason' => $status === 'rejected' ? $reason : null,
    'admin' => (int)$admin['id'], 'id' => $id]);
if ($stmt->rowCount() < 1) admin_proof_response(409, false, 'Document is missing or already reviewed.');
admin_proof_response(200, true, 'Document review saved.');
