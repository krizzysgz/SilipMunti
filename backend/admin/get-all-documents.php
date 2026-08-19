<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

$admin = require_role($pdo, ['admin']);

$status = $_GET['verification_status'] ?? '';
$documentType = $_GET['document_type'] ?? '';
$recordStatus = $_GET['record_status'] ?? 'active';
$search = trim($_GET['search'] ?? '');

$allowedStatuses = ['pending', 'approved', 'rejected'];
$allowedDocumentTypes = ['valid_id', 'barangay_clearance', 'land_title'];
$allowedRecordStatuses = ['active', 'deleted', 'all'];

if ($status !== '' && !in_array($status, $allowedStatuses, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid verification status.'
    ]);
    exit;
}

if ($documentType !== '' && !in_array($documentType, $allowedDocumentTypes, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid document type.'
    ]);
    exit;
}

if (!in_array($recordStatus, $allowedRecordStatuses, true)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid record status.'
    ]);
    exit;
}

$sql = "
    SELECT
        vd.id,
        vd.landlord_id,
        vd.document_type,
        vd.verification_status,
        vd.rejection_reason,
        vd.reviewed_at,
        vd.created_at,
        vd.updated_at,
        vd.deleted_at,
        CONCAT(landlord.first_name, ' ', landlord.last_name) AS landlord_name,
        landlord.email AS landlord_email,
        CONCAT(reviewer.first_name, ' ', reviewer.last_name) AS reviewer_name
    FROM verification_documents vd
    INNER JOIN users landlord
        ON landlord.id = vd.landlord_id
    LEFT JOIN users reviewer
        ON reviewer.id = vd.reviewed_by
    WHERE 1 = 1
";

$params = [];

if ($recordStatus === 'active') {
    $sql .= " AND vd.deleted_at IS NULL";
} elseif ($recordStatus === 'deleted') {
    $sql .= " AND vd.deleted_at IS NOT NULL";
}

if ($status !== '') {
    $sql .= " AND vd.verification_status = :verification_status";
    $params['verification_status'] = $status;
}

if ($documentType !== '') {
    $sql .= " AND vd.document_type = :document_type";
    $params['document_type'] = $documentType;
}

if ($search !== '') {
    $sql .= "
        AND (
            landlord.first_name LIKE :search
            OR landlord.last_name LIKE :search
            OR landlord.email LIKE :search
        )
    ";
    $params['search'] = '%' . $search . '%';
}

$sql .= " ORDER BY vd.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$documents = $stmt->fetchAll();

foreach ($documents as &$document) {
    $document['view_url'] =
        '/SilipMunti/backend/admin/view-document.php?id=' .
        $document['id'];
}

echo json_encode([
    'success' => true,
    'message' => 'Verification documents retrieved successfully.',
    'data' => [
        'documents' => $documents
    ]
]);