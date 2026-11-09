<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/gemini-client.php';
require_once __DIR__ . '/conversation-router.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

function aiChatError(string $message, int $status = 422): void
{
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
    exit;
}

function aiChatBlankPreferences(): array
{
    return [
        'budget_max' => null,
        'barangay' => '',
        'rental_type_id' => null,
        'occupancy' => null,
        'bedroom_no' => null,
        'amenities' => [],
        'note' => '',
    ];
}

function aiChatStoredList(mixed $value): array
{
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return [];

    $decoded = json_decode($value, true);

    if (is_array($decoded)) return $decoded;

    return preg_split('/\s*[,;|]\s*/', trim($value)) ?: [];
}

function aiChatAllowedLabel(mixed $value, array $allowed): ?string
{
    $value = trim((string) $value);

    if ($value === '') return '';

    foreach ($allowed as $label) {
        if (strcasecmp($value, (string) $label) === 0) {
            return (string) $label;
        }
    }

    return null;
}

function aiChatNormalizePreferences(
    mixed $candidate,
    array $fallback,
    array $options,
    bool $strictBarangay = false
): array {
    $normalized = $fallback;

    if (!is_array($candidate)) return $normalized;

    if (array_key_exists('budget_max', $candidate)) {
        $value = $candidate['budget_max'];

        $normalized['budget_max'] =
            $value === null || $value === ''
                ? null
                : (
                    is_numeric($value) && (float) $value >= 0
                        ? min((float) $value, 1000000)
                        : $fallback['budget_max']
                );
    }

    if (array_key_exists('barangay', $candidate)) {
        $value = $candidate['barangay'];

        if ($value === null || $value === '') {
            $normalized['barangay'] = '';
        } else {
            $allowedBarangay = aiChatAllowedLabel(
                $value,
                $options['barangays']
            );

            if ($allowedBarangay !== null) {
                $normalized['barangay'] = $allowedBarangay;
            } elseif ($strictBarangay) {
                $normalized['barangay'] = '';
            }
        }
    } elseif ($strictBarangay) {
        $normalized['barangay'] = '';
    }

    if (array_key_exists('rental_type_id', $candidate)) {
        $value = $candidate['rental_type_id'];

        if ($value === null || $value === '') {
            $normalized['rental_type_id'] = null;
        } elseif (ctype_digit((string) $value)) {
            $id = (int) $value;
            $allowedIds = array_column($options['rental_types'], 'id');

            if (in_array($id, $allowedIds, true)) {
                $normalized['rental_type_id'] = $id;
            }
        }
    }

    foreach (
        ['occupancy' => [1, 100], 'bedroom_no' => [0, 20]]
        as $key => [$min, $max]
    ) {
        if (!array_key_exists($key, $candidate)) continue;

        $value = $candidate[$key];

        if ($value === null || $value === '') {
            $normalized[$key] = null;
        } elseif (
            ctype_digit((string) $value)
            && (int) $value >= $min
            && (int) $value <= $max
        ) {
            $normalized[$key] = (int) $value;
        }
    }

    if (
        array_key_exists('amenities', $candidate)
        && is_array($candidate['amenities'])
    ) {
        $amenities = [];

        foreach (array_slice($candidate['amenities'], 0, 10) as $amenity) {
            $allowedAmenity = aiChatAllowedLabel(
                $amenity,
                $options['amenities']
            );

            if ($allowedAmenity !== null && $allowedAmenity !== '') {
                $amenities[] = $allowedAmenity;
            }
        }

        $normalized['amenities'] = array_values(array_unique($amenities));
    }

    if (array_key_exists('note', $candidate)) {
        $normalized['note'] = mb_substr(
            trim((string) $candidate['note']),
            0,
            500
        );
    }

    return $normalized;
}

function aiChatFallbackInterpretation(
    string $message,
    array $currentPreferences,
    array $options
): array {
    $preferences = $currentPreferences;
    $normalizedMessage = mb_strtolower($message);

    $resetPhrases = [
        'start over', 'reset', 'clear all', 'ulit tayo', 'simula ulit'
    ];

    foreach ($resetPhrases as $phrase) {
        if (str_contains($normalizedMessage, $phrase)) {
            return [
                'reset' => true,
                'intent' => 'reset',
                'preferences' => aiChatBlankPreferences(),
                'acknowledgement' =>
                    'I cleared your previous choices so we can start again.',
            ];
        }
    }

    if (
        preg_match(
            '/(?:under|below|maximum|max|budget|up to|hanggang)\s*(?:of\s*)?₱?\s*([0-9][0-9,.]*)\s*(k)?/i',
            $message,
            $budgetMatch
        )
    ) {
        $budget = (float) str_replace(',', '', $budgetMatch[1]);

        if (!empty($budgetMatch[2])) $budget *= 1000;

        $preferences['budget_max'] = min($budget, 1000000);
    } elseif (
        str_contains($normalizedMessage, 'any budget')
        || str_contains($normalizedMessage, 'kahit anong budget')
    ) {
        $preferences['budget_max'] = null;
    }

    if (
        str_contains($normalizedMessage, 'any location')
        || str_contains($normalizedMessage, 'kahit saan')
    ) {
        $preferences['barangay'] = '';
    } else {
        foreach ($options['barangays'] as $barangay) {
            if (
                str_contains(
                    $normalizedMessage,
                    mb_strtolower($barangay)
                )
            ) {
                $preferences['barangay'] = $barangay;
                break;
            }
        }
    }

    if (
        str_contains($normalizedMessage, 'any property type')
        || str_contains($normalizedMessage, 'kahit anong type')
    ) {
        $preferences['rental_type_id'] = null;
    } else {
        foreach ($options['rental_types'] as $type) {
            if (
                str_contains(
                    $normalizedMessage,
                    mb_strtolower($type['name'])
                )
            ) {
                $preferences['rental_type_id'] = $type['id'];
                break;
            }
        }
    }

    if (
        preg_match(
            '/(\d+)\s*(?:people|persons|occupants|tao)/i',
            $message,
            $match
        )
    ) {
        $preferences['occupancy'] = min(100, max(1, (int) $match[1]));
    }

    if (
        preg_match(
            '/(\d+)\s*(?:bedroom|bedrooms|br)\b/i',
            $message,
            $match
        )
    ) {
        $preferences['bedroom_no'] = min(20, max(0, (int) $match[1]));
    } elseif (str_contains($normalizedMessage, 'studio')) {
        $preferences['bedroom_no'] = 0;
    }

    foreach ($options['amenities'] as $amenity) {
        if (str_contains($normalizedMessage, mb_strtolower($amenity))) {
            $preferences['amenities'][] = $amenity;
        }
    }

    $preferences['amenities'] = array_values(array_unique(
        array_slice($preferences['amenities'], 0, 10)
    ));

    $intent = 'refine_search';

    foreach (
        ['available', 'availability', 'meron ba', 'mayroon ba', 'wala ba']
        as $word
    ) {
        if (str_contains($normalizedMessage, $word)) {
            $intent = 'availability_check';
            break;
        }
    }

    if ($intent === 'refine_search') {
        foreach (
            [
                'requirement', 'deposit', 'advance', 'contract',
                'lease', 'scam', 'safe', 'viewing', 'inspect', 'move in'
            ]
            as $word
        ) {
            if (str_contains($normalizedMessage, $word)) {
                $intent = 'general_question';
                break;
            }
        }
    }

    return [
        'reset' => false,
        'intent' => $intent,
        'preferences' => $preferences,
        'acknowledgement' =>
            'I updated the rental search using the details I understood from your message.',
    ];
}

function aiChatGeneralFallback(string $message): string
{
    $normalized = mb_strtolower($message);

    if (str_contains($normalized, 'requirement')) {
        return 'Karaniwang hinihingi ang valid ID, proof of income, at payment para sa deposit at advance rent. Depende pa rin ito sa landlord.';
    }

    if (
        str_contains($normalized, 'scam')
        || str_contains($normalized, 'safe')
    ) {
        return 'Para makaiwas sa scam, huwag munang magbayad bago ma-verify ang property, at humingi ng written agreement at official receipt.';
    }

    if (
        str_contains($normalized, 'contract')
        || str_contains($normalized, 'lease')
    ) {
        return 'Bago pumirma, tingnan ang monthly rent, deposit at advance, due date, utilities, at termination terms.';
    }

    if (
        str_contains($normalized, 'view')
        || str_contains($normalized, 'inspect')
    ) {
        return 'Sa property viewing, i-check ang locks, tubig, kuryente, leaks, at transport access. Kunan ng litrato ang existing damage bago mag-move in.';
    }

    return 'Matutulungan kita sa paghahanap ng rental, budget, requirements, viewing, lease terms, at renter safety. Ano ang hanap mo?';
}

function aiChatHistory(mixed $candidate): array
{
    if (!is_array($candidate)) return [];

    $history = [];

    foreach (array_slice($candidate, -8) as $item) {
        if (!is_array($item)) continue;

        $role = ($item['role'] ?? '') === 'assistant'
            ? 'assistant'
            : 'user';

        $message = trim((string) ($item['message'] ?? ''));

        if ($message !== '') {
            $history[] = [
                'role' => $role,
                'message' => mb_substr($message, 0, 500)
            ];
        }
    }

    return $history;
}

function aiChatExecuteFunction(
    PDO $pdo,
    string $name,
    array $args
): array {
    try {
        if ($name === 'get_available_listings') {
            $sql = "
                SELECT
                    l.id,
                    l.title,
                    l.price,
                    l.barangay,
                    rt.name AS rental_type,
                    l.bedroom_no,
                    l.occupancy_limit,
                    l.amenities
                FROM listings l
                INNER JOIN users u ON u.id = l.landlord_id
                INNER JOIN rental_types rt ON rt.id = l.rental_type_id
                WHERE l.deleted_at IS NULL
                  AND u.deleted_at IS NULL
                  AND u.landlord_status = 'approved'
                  AND rt.deleted_at IS NULL
                  AND l.verification_status = 'verified'
                  AND l.availability_status = 'available'
            ";

            $params = [];

            if (!empty($args['barangay'])) {
                $sql .= " AND l.barangay = :barangay";
                $params['barangay'] = $args['barangay'];
            }

            if (
                isset($args['max_price'])
                && is_numeric($args['max_price'])
            ) {
                $sql .= " AND l.price <= :max_price";
                $params['max_price'] = (float) $args['max_price'];
            }

            if (!empty($args['rental_type_id'])) {
                $sql .= " AND l.rental_type_id = :rental_type_id";
                $params['rental_type_id'] = (int) $args['rental_type_id'];
            }

            if (
                isset($args['bedroom_no'])
                && is_numeric($args['bedroom_no'])
            ) {
                $sql .= " AND l.bedroom_no >= :bedroom_no";
                $params['bedroom_no'] = (int) $args['bedroom_no'];
            }

            $limit = isset($args['limit']) && is_numeric($args['limit'])
                ? min(10, max(1, (int) $args['limit']))
                : 5;

            $sql .= " ORDER BY l.price ASC LIMIT {$limit}";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            return ['listings' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
        }

        if ($name === 'get_top_landlords') {
            $sql = "
                SELECT
                    u.id,
                    CONCAT(u.first_name, ' ', u.last_name) AS name,
                    COALESCE(AVG(r.rating), 0) AS average_rating,
                    COUNT(r.id) AS review_count
                FROM users u
                INNER JOIN listings l
                    ON l.landlord_id = u.id
                   AND l.deleted_at IS NULL
                INNER JOIN reviews r
                    ON r.listing_id = l.id
                   AND r.review_type = 'listing'
                   AND r.status = 'published'
                WHERE u.deleted_at IS NULL
                  AND u.landlord_status = 'approved'
                  AND u.role = 'landlord'
            ";

            $params = [];

            if (!empty($args['barangay'])) {
                $sql .= " AND l.barangay = :barangay";
                $params['barangay'] = $args['barangay'];
            }

            $sql .= "
                GROUP BY u.id, u.first_name, u.last_name
                HAVING review_count > 0
                ORDER BY average_rating DESC
            ";

            $limit = isset($args['limit']) && is_numeric($args['limit'])
                ? min(10, max(1, (int) $args['limit']))
                : 5;

            $sql .= " LIMIT {$limit}";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            return ['landlords' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
        }

        if ($name === 'get_listing_stats') {
            $sql = "
                SELECT
                    l.barangay,
                    COUNT(*) AS total_available,
                    ROUND(AVG(l.price), 2) AS avg_price
                FROM listings l
                INNER JOIN users u ON u.id = l.landlord_id
                WHERE l.deleted_at IS NULL
                  AND u.deleted_at IS NULL
                  AND u.landlord_status = 'approved'
                  AND l.verification_status = 'verified'
                  AND l.availability_status = 'available'
            ";

            $params = [];

            if (!empty($args['barangay'])) {
                $sql .= " AND l.barangay = :barangay";
                $params['barangay'] = $args['barangay'];
                $sql .= " GROUP BY l.barangay";
            } else {
                $sql .= "
                    GROUP BY l.barangay
                    ORDER BY total_available DESC
                ";
            }

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            return ['stats' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
        }

        return ['error' => 'Unknown function: ' . $name];
    } catch (Throwable $exception) {
        error_log('AI Function Error: ' . $exception->getMessage());

        return ['error' => 'Unable to fetch data from database.'];
    }
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    aiChatError('Invalid JSON data.', 400);
}

$message = trim((string) ($data['message'] ?? ''));

if ($message === '') {
    aiChatError('Please enter a rental question or preference.');
}

if (mb_strlen($message) > 500) {
    aiChatError('Message must not exceed 500 characters.');
}

try {
    $availableBarangays = $pdo->query("
        SELECT DISTINCT l.barangay
        FROM listings l
        INNER JOIN users u ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND u.landlord_status = 'approved'
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
          AND l.barangay IS NOT NULL
          AND TRIM(l.barangay) <> ''
        ORDER BY l.barangay ASC
    ")->fetchAll(PDO::FETCH_COLUMN);

    $officialBarangays = [
        'Alabang', 'Ayala Alabang', 'Bayanan', 'Buli', 'Cupang',
        'New Alabang Village', 'Poblacion', 'Putatan', 'Sucat', 'Tunasan'
    ];

    $barangays = array_values(array_unique(
        array_merge($officialBarangays, $availableBarangays)
    ));

    $rentalTypes = array_map(
        static fn (array $type): array => [
            'id' => (int) $type['id'],
            'name' => $type['name']
        ],
        $pdo->query("
            SELECT DISTINCT rt.id, rt.name
            FROM rental_types rt
            INNER JOIN listings l ON l.rental_type_id = rt.id
            INNER JOIN users u ON u.id = l.landlord_id
            WHERE rt.deleted_at IS NULL
              AND l.deleted_at IS NULL
              AND u.deleted_at IS NULL
              AND u.landlord_status = 'approved'
              AND l.verification_status = 'verified'
              AND l.availability_status = 'available'
            ORDER BY rt.name ASC
        ")->fetchAll(PDO::FETCH_ASSOC)
    );
    $amenityRows = $pdo->query("
        SELECT l.amenities
        FROM listings l
        INNER JOIN users u ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND u.landlord_status = 'approved'
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
          AND l.amenities IS NOT NULL
    ")->fetchAll(PDO::FETCH_COLUMN);

    $amenities = [];

    foreach ($amenityRows as $storedAmenities) {
        foreach (aiChatStoredList($storedAmenities) as $amenity) {
            $amenity = trim((string) $amenity);

            if ($amenity !== '' && mb_strlen($amenity) <= 100) {
                $amenities[mb_strtolower($amenity)] = $amenity;
            }
        }
    }

    $options = [
        'barangays' => array_values($barangays),
        'rental_types' => $rentalTypes,
        'amenities' => array_values($amenities)
    ];

    $blankPreferences = aiChatBlankPreferences();

    $currentPreferences = aiChatNormalizePreferences(
        $data['current_preferences'] ?? [],
        $blankPreferences,
        $options
    );

    $conversation = silipMuntiHandleConversation(
        $pdo, $data, $message, $currentPreferences, $options
    );
    if ($conversation !== null) {
        echo json_encode($conversation, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    $interpretation = extractGeminiRecommendationPreferences(
        $message,
        $currentPreferences,
        $options,
        aiChatHistory($data['history'] ?? [])
    );

    $aiInterpreted = $interpretation !== null;

    if ($interpretation === null) {
        $interpretation = aiChatFallbackInterpretation(
            $message,
            $currentPreferences,
            $options
        );
    }

    $reset = !empty($interpretation['reset']);
    $outOfScopeCity = $interpretation['out_of_scope_city'] ?? null;

    if ($outOfScopeCity !== null && trim($outOfScopeCity) !== '') {
        echo json_encode([
            'success' => true,
            'message' =>
                'SilipMunti currently covers Muntinlupa properties only. '
                . ucfirst($outOfScopeCity)
                . ' is outside our coverage. You can try Alabang, Sucat, Tunasan, or other Muntinlupa barangays.',
            'data' => [
                'ai_interpreted' => $aiInterpreted,
                'reset' => false,
                'intent' => 'availability_check',
                'direct_answer' => true,
                'recommend' => false,
                'response_mode' => 'database_answer',
                'ai_generated_answer' => false,
                'preferences' => $currentPreferences,
            ]
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    $preferences = $reset
        ? $blankPreferences
        : aiChatNormalizePreferences(
            $interpretation['preferences'] ?? [],
            $currentPreferences,
            $options
        );

    $acknowledgement = trim((string) (
        $interpretation['acknowledgement']
        ?? 'I updated your rental preferences.'
    ));

    $history = aiChatHistory($data['history'] ?? []);

    $allowedIntents = [
        'refine_search', 'availability_check', 'compare_results',
        'listing_question', 'general_question', 'help', 'reset'
    ];

    $intent = in_array(
        $interpretation['intent'] ?? '',
        $allowedIntents,
        true
    )
        ? $interpretation['intent']
        : ($reset ? 'reset' : 'refine_search');

    $generalIntents = [
        'compare_results', 'listing_question', 'general_question', 'help'
    ];

    $isGeneralAnswer =
        !$reset && in_array($intent, $generalIntents, true);

    if ($isGeneralAnswer) {
        $generalAnswer = generateGeminiRenterAssistantMessage(
            $message,
            $preferences,
            $history,
            $options,
            function (string $name, array $args) use ($pdo) {
                return aiChatExecuteFunction($pdo, $name, $args);
            }
        );

        $acknowledgement =
            $generalAnswer ?? aiChatGeneralFallback($message);

        echo json_encode([
            'success' => true,
            'message' => mb_substr($acknowledgement, 0, 1200),
            'data' => [
                'ai_interpreted' => $aiInterpreted,
                'reset' => false,
                'intent' => $intent,
                'direct_answer' => true,
                'recommend' => false,
                'response_mode' => 'renter_assistant',
                'ai_generated_answer' => $generalAnswer !== null,
                'preferences' => $preferences,
            ]
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => $acknowledgement !== ''
            ? mb_substr($acknowledgement, 0, 400)
            : 'I updated your rental preferences.',
        'data' => [
            'ai_interpreted' => $aiInterpreted,
            'reset' => $reset,
            'intent' => $intent,
            'direct_answer' => false,
            'recommend' => !$reset,
            'response_mode' => 'recommendation',
            'ai_generated_answer' => false,
            'preferences' => $preferences,
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to interpret the rental request.'
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'The AI rental assistant is temporarily unavailable.'
    ]);
}