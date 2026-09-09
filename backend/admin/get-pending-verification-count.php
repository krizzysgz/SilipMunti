<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

require_role($pdo, ['admin']);

try {
    $statement = $pdo->query(
        'SELECT COUNT(*) AS pending
         FROM verification_documents vd
         INNER JOIN users u ON u.id = vd.landlord_id
         WHERE vd.verification_status = "pending"
           AND vd.deleted_at IS NULL
           AND u.deleted_at IS NULL'
    );
    $result = $statement->fetch();

    echo json_encode([
        'success' => true,
        'message' => 'Pending verification count retrieved successfully.',
        'data' => [
            'pending' => (int) ($result['pending'] ?? 0)
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve the pending verification count.'
    ]);
}
