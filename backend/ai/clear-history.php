<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

$deleteStmt = $pdo->prepare("
    DELETE FROM ai_chat_messages
    WHERE renter_id = :renter_id
");

$deleteStmt->execute([
    'renter_id' => $renter['id']
]);

echo json_encode([
    'success' => true,
    'message' => 'AiReco history cleared successfully.',
    'data' => [
        'deleted_messages' => $deleteStmt->rowCount()
    ]
]);