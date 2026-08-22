<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$user = require_role($pdo, ['renter', 'landlord']);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$inquiryId = $data['inquiry_id'] ?? '';
$status = trim($data['inquiry_status'] ?? '');

if (!ctype_digit((string) $inquiryId) || (int) $inquiryId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid inquiry ID is required.'
    ]);
    exit;
}

$allowedStatuses = ['pending', 'closed'];

if (!in_array($status, $allowedStatuses, true)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Inquiry status must be pending or closed.'
    ]);
    exit;
}

$inquiryStmt = $pdo->prepare("
    SELECT
        i.id,
        i.renter_id,
        i.inquiry_status,
        l.landlord_id
    FROM inquiries i
    INNER JOIN listings l
        ON l.id = i.listing_id
    WHERE i.id = :inquiry_id
        AND i.deleted_at IS NULL
    LIMIT 1
");

$inquiryStmt->execute([
    'inquiry_id' => (int) $inquiryId
]);

$inquiry = $inquiryStmt->fetch();

if (!$inquiry) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'Inquiry not found.'
    ]);
    exit;
}

$isRenter = (
    $user['role'] === 'renter'
    && (int) $inquiry['renter_id'] === (int) $user['id']
);

$isLandlord = (
    $user['role'] === 'landlord'
    && (int) $inquiry['landlord_id'] === (int) $user['id']
);

if (!$isRenter && !$isLandlord) {
    http_response_code(403);

    echo json_encode([
        'success' => false,
        'message' => 'You are not allowed to update this inquiry.'
    ]);
    exit;
}

if ($inquiry['inquiry_status'] === $status) {
    echo json_encode([
        'success' => true,
        'message' => 'Inquiry already has this status.',
        'data' => [
            'inquiry_id' => (int) $inquiryId,
            'inquiry_status' => $status
        ]
    ]);
    exit;
}

$updateStmt = $pdo->prepare("
    UPDATE inquiries
    SET inquiry_status = :inquiry_status
    WHERE id = :inquiry_id
");

$updateStmt->execute([
    'inquiry_status' => $status,
    'inquiry_id' => (int) $inquiryId
]);

echo json_encode([
    'success' => true,
    'message' => $status === 'closed'
        ? 'Inquiry closed successfully.'
        : 'Inquiry reopened successfully.',
    'data' => [
        'inquiry_id' => (int) $inquiryId,
        'inquiry_status' => $status
    ]
]);