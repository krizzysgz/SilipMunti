<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.',
    ]);
    exit;
}

function parseRecommendationList(mixed $value): array
{
    if (is_array($value)) {
        return $value;
    }

    if (!is_string($value) || trim($value) === '') {
        return [];
    }

    $decoded = json_decode($value, true);

    if (is_array($decoded)) {
        return $decoded;
    }

    return preg_split('/\s*[,;|]\s*/', trim($value)) ?: [];
}

try {
    $barangayStatement = $pdo->query("
        SELECT DISTINCT l.barangay
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
          AND l.barangay IS NOT NULL
          AND TRIM(l.barangay) <> ''
        ORDER BY l.barangay ASC
    ");

    $typeStatement = $pdo->query("
        SELECT DISTINCT
            rt.id,
            rt.name
        FROM rental_types rt
        INNER JOIN listings l
            ON l.rental_type_id = rt.id
        INNER JOIN users u
            ON u.id = l.landlord_id
        WHERE rt.deleted_at IS NULL
          AND l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
        ORDER BY rt.name ASC
    ");

    $amenityStatement = $pdo->query("
        SELECT l.amenities
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
          AND l.amenities IS NOT NULL
    ");

    $amenityCounts = [];

    foreach ($amenityStatement->fetchAll(PDO::FETCH_COLUMN) as $storedAmenities) {
        foreach (parseRecommendationList($storedAmenities) as $amenity) {
            $amenity = trim((string) $amenity);

            if ($amenity === '' || mb_strlen($amenity) > 100) {
                continue;
            }

            $normalized = mb_strtolower($amenity);

            if (!isset($amenityCounts[$normalized])) {
                $amenityCounts[$normalized] = [
                    'label' => $amenity,
                    'count' => 0,
                ];
            }

            $amenityCounts[$normalized]['count']++;
        }
    }

    uasort(
        $amenityCounts,
        static fn (array $first, array $second): int =>
            $second['count'] <=> $first['count']
    );

    $rentalTypes = array_map(
        static fn (array $type): array => [
            'id' => (int) $type['id'],
            'name' => $type['name'],
        ],
        $typeStatement->fetchAll(PDO::FETCH_ASSOC)
    );

    echo json_encode([
        'success' => true,
        'message' => 'Recommendation options retrieved successfully.',
        'data' => [
            'barangays' => $barangayStatement->fetchAll(PDO::FETCH_COLUMN),
            'rental_types' => $rentalTypes,
            'amenities' => array_values(array_map(
                static fn (array $item): string => $item['label'],
                array_slice($amenityCounts, 0, 12, true)
            )),
        ],
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load recommendation options.',
    ]);
}

