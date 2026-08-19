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

try {
    $getDocuments = $pdo->query(
        'SELECT
            vd.id,
            vd.document_type,
            vd.verification_status,
            vd.created_at,
            u.id AS landlord_id,
            u.first_name,
            u.last_name,
            u.email,
            u.phone_number
         FROM verification_documents vd
         INNER JOIN users u
            ON u.id = vd.landlord_id
         WHERE vd.verification_status = "pending"
           AND vd.deleted_at IS NULL
           AND u.deleted_at IS NULL
         ORDER BY vd.created_at ASC'
    );

    $documents = $getDocuments->fetchAll();

    echo json_encode([
        'success' => true,
        'message' => 'Pending verification documents retrieved successfully.',
        'data' => [
            'total' => count($documents),
            'documents' => $documents
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve pending verification documents.'
    ]);
}