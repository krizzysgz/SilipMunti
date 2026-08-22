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

$user = require_role($pdo, ['renter', 'landlord']);

$inquiryId = $_GET['inquiry_id'] ?? '';

if (!ctype_digit((string) $inquiryId) || (int) $inquiryId < 1) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Valid inquiry ID is required.'
    ]);
    exit;
}

$inquiryStmt = $pdo->prepare("
    SELECT
        i.id AS inquiry_id,
        i.renter_id,
        i.inquiry_status,
        i.created_at,
        l.id AS listing_id,
        l.landlord_id,
        l.title AS listing_title,
        l.price,
        l.availability_status,
        CONCAT(renter.first_name, ' ', renter.last_name) AS renter_name,
        CONCAT(landlord.first_name, ' ', landlord.last_name) AS landlord_name
    FROM inquiries i
    INNER JOIN listings l
        ON l.id = i.listing_id
    INNER JOIN users renter
        ON renter.id = i.renter_id
    INNER JOIN users landlord
        ON landlord.id = l.landlord_id
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
        'message' => 'You are not allowed to view this inquiry.'
    ]);
    exit;
}

$messageStmt = $pdo->prepare("
    SELECT
        m.id,
        m.sender_id,
        m.message_text,
        m.is_read,
        m.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS sender_name,
        u.role AS sender_role,
        u.profile_picture
    FROM messages m
    INNER JOIN users u
        ON u.id = m.sender_id
    WHERE m.inquiry_id = :inquiry_id
    ORDER BY m.created_at ASC, m.id ASC
");

$messageStmt->execute([
    'inquiry_id' => (int) $inquiryId
]);

$messages = $messageStmt->fetchAll();

foreach ($messages as &$message) {
    $message['is_mine'] =
        (int) $message['sender_id'] === (int) $user['id'];

    $message['is_read'] = (bool) $message['is_read'];
}

if ($user['role'] === 'renter') {
    $otherUser = [
        'id' => (int) $inquiry['landlord_id'],
        'name' => $inquiry['landlord_name'],
        'role' => 'landlord'
    ];
} else {
    $otherUser = [
        'id' => (int) $inquiry['renter_id'],
        'name' => $inquiry['renter_name'],
        'role' => 'renter'
    ];
}

echo json_encode([
    'success' => true,
    'message' => 'Messages retrieved successfully.',
    'data' => [
        'inquiry' => [
            'id' => (int) $inquiry['inquiry_id'],
            'status' => $inquiry['inquiry_status'],
            'listing_id' => (int) $inquiry['listing_id'],
            'listing_title' => $inquiry['listing_title'],
            'price' => $inquiry['price'],
            'availability_status' => $inquiry['availability_status'],
            'created_at' => $inquiry['created_at']
        ],
        'other_user' => $otherUser,
        'messages' => $messages
    ]
]);