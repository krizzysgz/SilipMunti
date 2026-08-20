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

$sql = "
    SELECT
        i.id AS inquiry_id,
        i.inquiry_status,
        i.created_at,
        l.id AS listing_id,
        l.title AS listing_title,
        l.price,
        l.availability_status,
        renter.id AS renter_id,
        CONCAT(renter.first_name, ' ', renter.last_name) AS renter_name,
        landlord.id AS landlord_id,
        CONCAT(landlord.first_name, ' ', landlord.last_name) AS landlord_name,
        (
            SELECT m.message_text
            FROM messages m
            WHERE m.inquiry_id = i.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
        ) AS last_message,
        (
            SELECT m.created_at
            FROM messages m
            WHERE m.inquiry_id = i.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
        ) AS last_message_at,
        (
            SELECT COUNT(*)
            FROM messages m
            WHERE m.inquiry_id = i.id
                AND m.sender_id != :unread_user_id
                AND m.is_read = 0
        ) AS unread_count
    FROM inquiries i
    INNER JOIN listings l
        ON l.id = i.listing_id
    INNER JOIN users renter
        ON renter.id = i.renter_id
    INNER JOIN users landlord
        ON landlord.id = l.landlord_id
    WHERE i.deleted_at IS NULL
";

$params = [
    'unread_user_id' => $user['id']
];

if ($user['role'] === 'renter') {
    $sql .= " AND i.renter_id = :account_id";
} else {
    $sql .= " AND l.landlord_id = :account_id";
}

$params['account_id'] = $user['id'];

$sql .= "
    ORDER BY
        COALESCE(last_message_at, i.created_at) DESC
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$inquiries = $stmt->fetchAll();

$imageStmt = $pdo->prepare("
    SELECT image_path
    FROM listing_images
    WHERE listing_id = :listing_id
        AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1
");

foreach ($inquiries as &$inquiry) {
    $imageStmt->execute([
        'listing_id' => $inquiry['listing_id']
    ]);

    $image = $imageStmt->fetch();

    $inquiry['primary_image'] = $image
        ? '/SilipMunti/backend/' . $image['image_path']
        : null;

    if ($user['role'] === 'renter') {
        $inquiry['other_user'] = [
            'id' => $inquiry['landlord_id'],
            'name' => $inquiry['landlord_name'],
            'role' => 'landlord'
        ];
    } else {
        $inquiry['other_user'] = [
            'id' => $inquiry['renter_id'],
            'name' => $inquiry['renter_name'],
            'role' => 'renter'
        ];
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Inquiries retrieved successfully.',
    'data' => [
        'total' => count($inquiries),
        'inquiries' => $inquiries
    ]
]);