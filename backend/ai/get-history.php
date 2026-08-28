<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

$limit = $_GET['limit'] ?? 50;

if (
    !ctype_digit((string) $limit)
    || (int) $limit < 1
    || (int) $limit > 100
) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Limit must be between 1 and 100.'
    ]);
    exit;
}

$limit = (int) $limit;

$stmt = $pdo->prepare("
    SELECT
        id,
        sender,
        message_text,
        extracted_filters,
        created_at
    FROM ai_chat_messages
    WHERE renter_id = :renter_id
    ORDER BY created_at DESC, id DESC
    LIMIT {$limit}
");

$stmt->execute([
    'renter_id' => $renter['id']
]);

$messages = array_reverse($stmt->fetchAll());

foreach ($messages as &$message) {
    $message['extracted_filters'] =
        $message['extracted_filters']
            ? json_decode(
                $message['extracted_filters'],
                true
            )
            : null;

    $message['is_mine'] =
        $message['sender'] === 'renter';
}

echo json_encode([
    'success' => true,
    'message' => 'AiReco history retrieved successfully.',
    'data' => [
        'total' => count($messages),
        'messages' => $messages
    ]
]);