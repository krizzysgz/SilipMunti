<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/gemini-client.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.',
    ]);
    exit;
}

function recommendationError(string $message, int $status = 422): void
{
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'message' => $message,
    ]);
    exit;
}

function recommendationList(mixed $value): array
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

function recommendationImageUrl(?string $path): ?string
{
    $path = trim((string) $path);

    if ($path === '') {
        return null;
    }

    if (preg_match('/^(https?:)?\/\//i', $path) || str_starts_with($path, '/')) {
        return $path;
    }

    return '/SilipMunti/backend/' . ltrim($path, '/');
}

function normalizeRecommendationText(string $value): string
{
    return mb_strtolower(trim($value));
}

function recommendationKeywords(string $value): array
{
    $stopWords = [
        'about', 'after', 'again', 'also', 'ang', 'any', 'available',
        'for', 'from', 'good', 'have', 'house', 'lang', 'near', 'need',
        'property', 'rental', 'show', 'that', 'the', 'this', 'with', 'yung',
    ];
    $words = preg_split(
        '/[^\p{L}\p{N}]+/u',
        normalizeRecommendationText($value)
    ) ?: [];

    return array_values(array_unique(array_filter(
        $words,
        static fn (string $word): bool =>
            mb_strlen($word) >= 3
            && !in_array($word, $stopWords, true)
    )));
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    recommendationError('Invalid JSON data.', 400);
}

$budgetMaximum = $data['budget_max'] ?? null;
$barangay = trim((string) ($data['barangay'] ?? ''));
$rentalTypeId = $data['rental_type_id'] ?? null;
$bedroomNumber = $data['bedroom_no'] ?? null;
$occupancy = $data['occupancy'] ?? null;
$note = trim((string) ($data['note'] ?? ''));
$requestedAmenities = $data['amenities'] ?? [];

if ($budgetMaximum !== null && $budgetMaximum !== '') {
    if (!is_numeric($budgetMaximum) || (float) $budgetMaximum < 0) {
        recommendationError('Invalid maximum budget.');
    }

    $budgetMaximum = min((float) $budgetMaximum, 1000000);
} else {
    $budgetMaximum = null;
}

if (mb_strlen($barangay) > 100) {
    recommendationError('Barangay must not exceed 100 characters.');
}

if ($rentalTypeId !== null && $rentalTypeId !== '') {
    if (!ctype_digit((string) $rentalTypeId) || (int) $rentalTypeId < 1) {
        recommendationError('Invalid rental type.');
    }

    $rentalTypeId = (int) $rentalTypeId;
} else {
    $rentalTypeId = null;
}

if ($bedroomNumber !== null && $bedroomNumber !== '') {
    if (!ctype_digit((string) $bedroomNumber) || (int) $bedroomNumber > 20) {
        recommendationError('Invalid number of bedrooms.');
    }

    $bedroomNumber = (int) $bedroomNumber;
} else {
    $bedroomNumber = null;
}

if ($occupancy !== null && $occupancy !== '') {
    if (
        !ctype_digit((string) $occupancy)
        || (int) $occupancy < 1
        || (int) $occupancy > 100
    ) {
        recommendationError('Invalid number of occupants.');
    }

    $occupancy = (int) $occupancy;
} else {
    $occupancy = null;
}

if (!is_array($requestedAmenities) || count($requestedAmenities) > 10) {
    recommendationError('Invalid amenities selection.');
}

$requestedAmenities = array_values(array_unique(array_filter(array_map(
    static function (mixed $amenity): string {
        $amenity = trim((string) $amenity);

        return mb_strlen($amenity) <= 100 ? $amenity : '';
    },
    $requestedAmenities
))));

if (mb_strlen($note) > 500) {
    recommendationError('Additional preference must not exceed 500 characters.');
}

try {
    $statement = $pdo->query("
        SELECT
            l.id,
            l.landlord_id,
            l.rental_type_id,
            rt.name AS rental_type,
            l.title,
            l.description,
            l.price,
            l.address,
            l.city,
            l.barangay,
            l.bedroom_no,
            l.listing_size,
            l.occupancy_limit,
            l.amenities,
            l.nearby_establishments,
            l.transport_routes,
            l.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS landlord_name,
            (
                SELECT li.image_path
                FROM listing_images li
                WHERE li.listing_id = l.id
                  AND li.deleted_at IS NULL
                ORDER BY li.id ASC
                LIMIT 1
            ) AS primary_image_path
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND rt.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 250
    ");

    $listings = $statement->fetchAll(PDO::FETCH_ASSOC);
    $ranked = [];
    $selectedRentalType = null;
    $normalizedRequestedAmenities = array_map(
        'normalizeRecommendationText',
        $requestedAmenities
    );

    foreach ($listings as $listing) {
        $price = (float) $listing['price'];
        $listingOccupancy = $listing['occupancy_limit'] !== null
            ? (int) $listing['occupancy_limit']
            : null;

        if (
            $rentalTypeId !== null
            && (int) $listing['rental_type_id'] === $rentalTypeId
        ) {
            $selectedRentalType = $listing['rental_type'];
        }

        if ($budgetMaximum !== null && $price > $budgetMaximum) {
            continue;
        }

        if (
            $occupancy !== null
            && ($listingOccupancy === null || $listingOccupancy < $occupancy)
        ) {
            continue;
        }

        $possibleScore = 0.0;
        $earnedScore = 0.0;
        $reasons = [];

        if ($budgetMaximum !== null) {
            $possibleScore += 30;
            $earnedScore += 30;
            $reasons[] = 'Within your budget';
        }

        if ($barangay !== '') {
            $possibleScore += 25;

            if (strcasecmp($listing['barangay'], $barangay) === 0) {
                $earnedScore += 25;
                $reasons[] = 'Located in ' . $listing['barangay'];
            }
        }

        if ($rentalTypeId !== null) {
            $possibleScore += 18;

            if ((int) $listing['rental_type_id'] === $rentalTypeId) {
                $earnedScore += 18;
                $reasons[] = 'Matches your preferred property type';
            }
        }

        $listingBedrooms = $listing['bedroom_no'] !== null
            ? (int) $listing['bedroom_no']
            : null;

        if ($bedroomNumber !== null) {
            $possibleScore += 12;

            if ($listingBedrooms !== null && $listingBedrooms >= $bedroomNumber) {
                $earnedScore += $listingBedrooms === $bedroomNumber ? 12 : 10;
                $reasons[] = $bedroomNumber === 0
                    ? 'Studio-friendly layout'
                    : 'Has enough bedrooms';
            }
        }

        if ($occupancy !== null) {
            $possibleScore += 10;
            $earnedScore += 10;
            $reasons[] = 'Fits your household size';
        }

        $listingAmenities = array_values(array_filter(array_map(
            static fn (mixed $amenity): string => trim((string) $amenity),
            recommendationList($listing['amenities'])
        )));

        if ($normalizedRequestedAmenities !== []) {
            $possibleScore += 15;
            $normalizedListingAmenities = array_map(
                'normalizeRecommendationText',
                $listingAmenities
            );
            $matchedAmenities = [];

            foreach ($normalizedRequestedAmenities as $index => $requestedAmenity) {
                if (in_array($requestedAmenity, $normalizedListingAmenities, true)) {
                    $matchedAmenities[] = $requestedAmenities[$index];
                }
            }

            $amenityRatio = count($matchedAmenities) / count($requestedAmenities);
            $earnedScore += 15 * $amenityRatio;

            if ($matchedAmenities !== []) {
                $reasons[] = 'Includes ' . implode(', ', array_slice($matchedAmenities, 0, 2));
            }
        }

        if ($note !== '') {
            $possibleScore += 10;
            $noteKeywords = recommendationKeywords($note);
            $searchableText = normalizeRecommendationText(implode(' ', [
                (string) $listing['title'],
                (string) $listing['description'],
                (string) $listing['address'],
                (string) $listing['barangay'],
                (string) $listing['nearby_establishments'],
                (string) $listing['transport_routes'],
                implode(' ', $listingAmenities),
            ]));
            $matchedKeywords = array_values(array_filter(
                $noteKeywords,
                static fn (string $keyword): bool =>
                    str_contains($searchableText, $keyword)
            ));
            $transportRequested = preg_match(
                '/transport|commute|jeep|bus|train|route/i',
                $note
            ) === 1;
            $nearbyRequested = preg_match(
                '/school|hospital|market|mall|establishment/i',
                $note
            ) === 1;
            $specialMatch = (
                $transportRequested
                && trim((string) $listing['transport_routes']) !== ''
            ) || (
                $nearbyRequested
                && trim((string) $listing['nearby_establishments']) !== ''
            );

            if ($matchedKeywords !== [] || $specialMatch) {
                $keywordRatio = $noteKeywords !== []
                    ? count($matchedKeywords) / count($noteKeywords)
                    : 0;
                $earnedScore += 10 * max(0.65, min(1, $keywordRatio));
                $reasons[] = 'Matches your additional preference';
            }
        }

        $matchRatio = $possibleScore > 0
            ? $earnedScore / $possibleScore
            : 0.7;
        $matchPercentage = (int) round(55 + (44 * $matchRatio));

        if ($reasons === []) {
            $reasons[] = 'Verified and currently available';
        }

        $ranked[] = [
            'id' => (int) $listing['id'],
            'title' => $listing['title'],
            'description' => mb_substr((string) $listing['description'], 0, 220),
            'price' => $price,
            'barangay' => $listing['barangay'],
            'city' => $listing['city'],
            'address' => $listing['address'],
            'rental_type_id' => (int) $listing['rental_type_id'],
            'rental_type' => $listing['rental_type'],
            'bedroom_no' => $listingBedrooms,
            'occupancy_limit' => $listingOccupancy,
            'listing_size' => $listing['listing_size'] !== null
                ? (float) $listing['listing_size']
                : null,
            'amenities' => $listingAmenities,
            'landlord_name' => $listing['landlord_name'],
            'primary_image' => recommendationImageUrl($listing['primary_image_path']),
            'match_percentage' => min(99, max(55, $matchPercentage)),
            'match_reasons' => array_slice($reasons, 0, 3),
            '_score' => $matchRatio,
        ];
    }

    usort(
        $ranked,
        static function (array $first, array $second): int {
            $scoreComparison = $second['_score'] <=> $first['_score'];

            if ($scoreComparison !== 0) {
                return $scoreComparison;
            }

            $priceComparison = $first['price'] <=> $second['price'];

            return $priceComparison !== 0
                ? $priceComparison
                : $second['id'] <=> $first['id'];
        }
    );

    $recommendations = array_slice($ranked, 0, 5);

    foreach ($recommendations as &$recommendation) {
        unset($recommendation['_score']);
    }

    unset($recommendation);

    $preferences = [
        'budget_max' => $budgetMaximum,
        'barangay' => $barangay !== '' ? $barangay : null,
        'rental_type_id' => $rentalTypeId,
        'rental_type' => $selectedRentalType,
        'bedroom_no' => $bedroomNumber,
        'occupancy' => $occupancy,
        'amenities' => $requestedAmenities,
        'note' => $note !== '' ? $note : null,
    ];

    if ($recommendations === []) {
        echo json_encode([
            'success' => true,
            'message' => 'No exact matches were found. Try increasing your budget or skipping one preference.',
            'data' => [
                'ai_generated' => false,
                'preferences' => $preferences,
                'recommendations' => [],
                'total' => 0,
            ],
        ]);
        exit;
    }

    $aiMessage = generateGeminiRecommendationMessage(
        $preferences,
        $recommendations
    );
    $topRecommendation = $recommendations[0];
    $fallbackMessage = sprintf(
        'I found %d verified %s based on your preferences. %s is the strongest match, but you can compare all the options below before deciding.',
        count($recommendations),
        count($recommendations) === 1 ? 'property' : 'properties',
        $topRecommendation['title']
    );

    echo json_encode([
        'success' => true,
        'message' => $aiMessage ?? $fallbackMessage,
        'data' => [
            'ai_generated' => $aiMessage !== null,
            'preferences' => $preferences,
            'recommendations' => $recommendations,
            'total' => count($recommendations),
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to generate property recommendations.',
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'The recommendation service is temporarily unavailable.',
    ]);
}
