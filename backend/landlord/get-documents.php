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

$user = require_role($pdo, ['landlord']);

try {
    $getDocuments = $pdo->prepare(
        'SELECT
            id,
            document_type,
            verification_status,
            reviewed_at,
            rejection_reason,
            created_at,
            updated_at
         FROM verification_documents
         WHERE landlord_id = ?
           AND deleted_at IS NULL
         ORDER BY created_at DESC'
    );

    $getDocuments->execute([$user['id']]);

    $documents = $getDocuments->fetchAll();

    echo json_encode([
        'success' => true,
        'message' => 'Verification documents retrieved successfully.',
        'data' => [
            'documents' => $documents,
            'account_status' =>
                $user['account_status'] ?? 'pending',
            'verification_level' =>
                $user['verification_level'] ?? 'unverified',
            'approved_document_count' =>
                $user['approved_document_count'] ?? 0,
            'is_fully_verified' =>
                $user['is_fully_verified'] ?? false,
            'rejection_reason' =>
                $user['landlord_rejection_reason'] ?? null
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve verification documents.'
    ]);
}
