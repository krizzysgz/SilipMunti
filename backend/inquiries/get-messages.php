<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

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

if (
    !ctype_digit((string) $inquiryId)
    || (int) $inquiryId < 1
) {
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
        CONCAT(
            renter.first_name,
            ' ',
            renter.last_name
        ) AS renter_name,
        renter.profile_picture AS renter_profile_picture,
        CONCAT(
            landlord.first_name,
            ' ',
            landlord.last_name
        ) AS landlord_name,
        landlord.profile_picture AS landlord_profile_picture
    FROM inquiries i
    INNER JOIN listings l
        ON l.id = i.listing_id
    INNER JOIN users renter
        ON renter.id = i.renter_id
    INNER JOIN users landlord
        ON landlord.id = l.landlord_id
    WHERE i.id = :inquiry_id
        AND i.deleted_at IS NULL
        AND l.deleted_at IS NULL
        AND renter.deleted_at IS NULL
        AND landlord.deleted_at IS NULL
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
        m.reply_to_message_id,
        m.message_text,
        m.is_read,
        m.created_at,
        CONCAT(
            sender.first_name,
            ' ',
            sender.last_name
        ) AS sender_name,
        sender.role AS sender_role,
        sender.profile_picture,
        replied.id AS replied_message_id,
        replied.sender_id AS replied_sender_id,
        replied.message_text AS replied_message_text,
        CONCAT(
            replied_sender.first_name,
            ' ',
            replied_sender.last_name
        ) AS replied_sender_name
    FROM messages m
    INNER JOIN users sender
        ON sender.id = m.sender_id
    LEFT JOIN messages replied
        ON replied.id = m.reply_to_message_id
        AND replied.inquiry_id = m.inquiry_id
        AND replied.deleted_at IS NULL
    LEFT JOIN users replied_sender
        ON replied_sender.id = replied.sender_id
    WHERE m.inquiry_id = :inquiry_id
        AND m.deleted_at IS NULL
        AND sender.deleted_at IS NULL
    ORDER BY m.created_at ASC, m.id ASC
");

$messageStmt->execute([
    'inquiry_id' => (int) $inquiryId
]);

$messages = $messageStmt->fetchAll();

foreach ($messages as &$message) {
    $message['id'] = (int) $message['id'];
    $message['sender_id'] = (int) $message['sender_id'];
    $message['reply_to_message_id'] =
        $message['reply_to_message_id'] !== null
            ? (int) $message['reply_to_message_id']
            : null;

    $message['is_mine'] =
        (int) $message['sender_id'] === (int) $user['id'];

    $message['is_read'] = (bool) $message['is_read'];

    if ($message['profile_picture']) {
        $message['profile_picture_url'] =
            '/SilipMunti/backend/'
            . $message['profile_picture'];
    } else {
        $message['profile_picture_url'] = null;
    }

    if ($message['replied_message_id'] !== null) {
        $message['reply_to'] = [
            'id' => (int) $message['replied_message_id'],
            'sender_id' => (int) $message['replied_sender_id'],
            'sender_name' => $message['replied_sender_name'],
            'message_text' => $message['replied_message_text']
        ];
    } else {
        $message['reply_to'] = null;
    }

    unset(
        $message['replied_message_id'],
        $message['replied_sender_id'],
        $message['replied_sender_name'],
        $message['replied_message_text']
    );
}

unset($message);

if ($user['role'] === 'renter') {
    $profilePicture = $inquiry['landlord_profile_picture'];

    $otherUser = [
        'id' => (int) $inquiry['landlord_id'],
        'name' => $inquiry['landlord_name'],
        'role' => 'landlord',
        'profile_picture' => $profilePicture,
        'profile_picture_url' => $profilePicture
            ? '/SilipMunti/backend/' . $profilePicture
            : null
    ];
} else {
    $profilePicture = $inquiry['renter_profile_picture'];

    $otherUser = [
        'id' => (int) $inquiry['renter_id'],
        'name' => $inquiry['renter_name'],
        'role' => 'renter',
        'profile_picture' => $profilePicture,
        'profile_picture_url' => $profilePicture
            ? '/SilipMunti/backend/' . $profilePicture
            : null
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
            'availability_status' =>
                $inquiry['availability_status'],
            'created_at' => $inquiry['created_at']
        ],
        'other_user' => $otherUser,
        'messages' => $messages
    ]
]);