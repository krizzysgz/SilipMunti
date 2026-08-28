<?php

header('Content-Type: application/json');

require_once '../config/database.php';
require_once '../config/gemini.php';
require_once '../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$renter = require_role($pdo, ['renter']);

$now = time();
$lastRequest = $_SESSION['last_ai_request_at'] ?? 0;

if ($now - $lastRequest < 2) {
    http_response_code(429);

    echo json_encode([
        'success' => false,
        'message' => 'Please wait before sending another message.'
    ]);
    exit;
}

$_SESSION['last_ai_request_at'] = $now;

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid JSON data.'
    ]);
    exit;
}

$message = trim($data['message'] ?? '');

if ($message === '') {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Message is required.'
    ]);
    exit;
}

if (mb_strlen($message) > 500) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Message must not exceed 500 characters.'
    ]);
    exit;
}

try {
    $filters = extractRentalFilters($message);
} catch (Throwable $e) {
    http_response_code(503);

    echo json_encode([
        'success' => false,
        'message' => 'AiReco is temporarily unavailable.'
    ]);
    exit;
}

$allowedIntents = [
    'property_search',
    'greeting',
    'help',
    'unrelated'
];

$intent = $filters['intent'] ?? 'unrelated';

if (!in_array($intent, $allowedIntents, true)) {
    $intent = 'unrelated';
}

$filters['intent'] = $intent;
$filters['barangay'] = isset($filters['barangay'])
    ? trim((string) $filters['barangay'])
    : null;

$filters['rental_type'] = isset($filters['rental_type'])
    ? trim((string) $filters['rental_type'])
    : null;

$filters['min_price'] = is_numeric($filters['min_price'] ?? null)
    ? max(0, (float) $filters['min_price'])
    : null;

$filters['max_price'] = is_numeric($filters['max_price'] ?? null)
    ? max(0, (float) $filters['max_price'])
    : null;

$filters['bedroom_no'] = is_numeric($filters['bedroom_no'] ?? null)
    ? max(0, (int) $filters['bedroom_no'])
    : null;

$filters['occupancy_limit'] = is_numeric(
    $filters['occupancy_limit'] ?? null
)
    ? max(1, (int) $filters['occupancy_limit'])
    : null;

$filters['amenities'] = is_array($filters['amenities'] ?? null)
    ? array_values(
        array_filter(
            array_map(
                fn($amenity) => trim((string) $amenity),
                array_slice($filters['amenities'], 0, 5)
            )
        )
    )
    : [];

if (
    $filters['min_price'] !== null
    && $filters['max_price'] !== null
    && $filters['min_price'] > $filters['max_price']
) {
    [$filters['min_price'], $filters['max_price']] = [
        $filters['max_price'],
        $filters['min_price']
    ];
}

$recommendations = [];

if ($intent === 'greeting') {
    $reply = 'Hello! Sabihin mo ang preferred location, budget, rental type, at requirements mo para makahanap ako ng property.';
} elseif ($intent === 'help') {
    $reply = 'Maaari mong sabihin ang barangay, budget, rental type, bedrooms, occupancy, at amenities na kailangan mo.';
} elseif ($intent === 'unrelated') {
    $reply = 'Matutulungan lamang kita sa paghahanap ng rental properties sa Muntinlupa City.';
} else {
    $sql = "
        SELECT
            l.id,
            l.title,
            l.description,
            l.price,
            l.address,
            l.city,
            l.barangay,
            l.latitude,
            l.longitude,
            l.bedroom_no,
            l.listing_size,
            l.occupancy_limit,
            l.availability_status,
            l.nearby_establishments,
            l.transport_routes,
            l.amenities,
            rt.name AS rental_type
        FROM listings l
        INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
        INNER JOIN users landlord
            ON landlord.id = l.landlord_id
        WHERE l.verification_status = 'verified'
            AND l.availability_status = 'available'
            AND l.deleted_at IS NULL
            AND rt.deleted_at IS NULL
            AND landlord.deleted_at IS NULL
    ";

    $params = [];

    if ($filters['barangay']) {
        $sql .= " AND l.barangay LIKE :barangay";
        $params['barangay'] =
            '%' . $filters['barangay'] . '%';
    }

    if ($filters['rental_type']) {
        $sql .= " AND rt.name LIKE :rental_type";
        $params['rental_type'] =
            '%' . $filters['rental_type'] . '%';
    }

    if ($filters['min_price'] !== null) {
        $sql .= " AND l.price >= :min_price";
        $params['min_price'] = $filters['min_price'];
    }

    if ($filters['max_price'] !== null) {
        $sql .= " AND l.price <= :max_price";
        $params['max_price'] = $filters['max_price'];
    }

    if ($filters['bedroom_no'] !== null) {
        $sql .= " AND l.bedroom_no >= :bedroom_no";
        $params['bedroom_no'] = $filters['bedroom_no'];
    }

    if ($filters['occupancy_limit'] !== null) {
        $sql .= " AND l.occupancy_limit >= :occupancy_limit";
        $params['occupancy_limit'] =
            $filters['occupancy_limit'];
    }

    foreach ($filters['amenities'] as $index => $amenity) {
        $parameter = 'amenity_' . $index;

        $sql .= " AND l.amenities LIKE :{$parameter}";
        $params[$parameter] = '%' . $amenity . '%';
    }

    $sql .= "
        ORDER BY l.price ASC, l.created_at DESC
        LIMIT 10
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $recommendations = $stmt->fetchAll();

    $imageStmt = $pdo->prepare("
        SELECT image_path
        FROM listing_images
        WHERE listing_id = :listing_id
            AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
    ");

    foreach ($recommendations as &$recommendation) {
        $imageStmt->execute([
            'listing_id' => $recommendation['id']
        ]);

        $image = $imageStmt->fetch();

        $recommendation['primary_image'] = $image
            ? '/SilipMunti/backend/' . $image['image_path']
            : null;
    }

    $total = count($recommendations);

    if ($total > 0) {
        $reply = "May nakita akong {$total} verified at available rental properties na maaaring tumugma sa preferences mo.";
    } else {
        $reply = 'Wala akong nakitang exact match. Subukan mong taasan ang budget o bawasan ang requirements.';
    }
}

try {
    $pdo->beginTransaction();

    $messageStmt = $pdo->prepare("
        INSERT INTO ai_chat_messages (
            renter_id,
            sender,
            message_text,
            extracted_filters,
            created_at
        )
        VALUES (
            :renter_id,
            :sender,
            :message_text,
            :extracted_filters,
            NOW()
        )
    ");

    $encodedFilters = json_encode(
        $filters,
        JSON_UNESCAPED_UNICODE
    );

    $messageStmt->execute([
        'renter_id' => $renter['id'],
        'sender' => 'renter',
        'message_text' => $message,
        'extracted_filters' => $encodedFilters
    ]);

    $messageStmt->execute([
        'renter_id' => $renter['id'],
        'sender' => 'ai',
        'message_text' => $reply,
        'extracted_filters' => $encodedFilters
    ]);

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to save AiReco conversation.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => 'AiReco response generated successfully.',
    'data' => [
        'reply' => $reply,
        'extracted_filters' => $filters,
        'total_recommendations' => count($recommendations),
        'recommendations' => $recommendations
    ]
]);