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

function aiChatError(string $message, int $status = 422): void
{
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'message' => $message,
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

function aiChatAllowedLabel(mixed $value, array $allowed): ?string
{
    $value = trim((string) $value);

    if ($value === '') {
        return '';
    }

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
    array $options
): array {
    $normalized = $fallback;

    if (!is_array($candidate)) {
        return $normalized;
    }

    if (array_key_exists('budget_max', $candidate)) {
        $value = $candidate['budget_max'];
        $normalized['budget_max'] = $value === null || $value === ''
            ? null
            : (is_numeric($value) && (float) $value >= 0
                ? min((float) $value, 1000000)
                : $fallback['budget_max']);
    }

    if (array_key_exists('barangay', $candidate)) {
        $allowedBarangay = aiChatAllowedLabel(
            $candidate['barangay'],
            $options['barangays']
        );

        if ($allowedBarangay !== null) {
            $normalized['barangay'] = $allowedBarangay;
        }
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
        [
            'occupancy' => [1, 100],
            'bedroom_no' => [0, 20],
        ] as $key => [$minimum, $maximum]
    ) {
        if (!array_key_exists($key, $candidate)) {
            continue;
        }

        $value = $candidate[$key];

        if ($value === null || $value === '') {
            $normalized[$key] = null;
        } elseif (
            ctype_digit((string) $value)
            && (int) $value >= $minimum
            && (int) $value <= $maximum
        ) {
            $normalized[$key] = (int) $value;
        }
    }

    if (array_key_exists('amenities', $candidate) && is_array($candidate['amenities'])) {
        $allowedAmenities = $options['amenities'];
        $amenities = [];

        foreach (array_slice($candidate['amenities'], 0, 10) as $amenity) {
            $allowedAmenity = aiChatAllowedLabel($amenity, $allowedAmenities);

            if ($allowedAmenity !== null && $allowedAmenity !== '') {
                $amenities[] = $allowedAmenity;
            }
        }

        $normalized['amenities'] = array_values(array_unique($amenities));
    }

    if (array_key_exists('note', $candidate)) {
        $note = trim((string) $candidate['note']);
        $normalized['note'] = mb_substr($note, 0, 500);
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
        'start over',
        'reset',
        'clear all',
        'ulit tayo',
        'simula ulit',
    ];

    foreach ($resetPhrases as $phrase) {
        if (str_contains($normalizedMessage, $phrase)) {
            return [
                'reset' => true,
                'intent' => 'reset',
                'preferences' => aiChatBlankPreferences(),
                'acknowledgement' => 'I cleared your previous choices so we can start again.',
            ];
        }
    }

    if (preg_match(
        '/(?:under|below|maximum|max|budget|up to|hanggang)\s*(?:of\s*)?₱?\s*([0-9][0-9,.]*)\s*(k)?/i',
        $message,
        $budgetMatch
    )) {
        $budget = (float) str_replace(',', '', $budgetMatch[1]);

        if (!empty($budgetMatch[2])) {
            $budget *= 1000;
        }

        $preferences['budget_max'] = min($budget, 1000000);
    } elseif (
        str_contains($normalizedMessage, 'any budget')
        || str_contains($normalizedMessage, 'flexible budget')
        || str_contains($normalizedMessage, 'kahit anong budget')
    ) {
        $preferences['budget_max'] = null;
    }

    if (
        str_contains($normalizedMessage, 'any location')
        || str_contains($normalizedMessage, 'kahit saan')
        || str_contains($normalizedMessage, 'any barangay')
    ) {
        $preferences['barangay'] = '';
    } else {
        foreach ($options['barangays'] as $barangay) {
            if (str_contains($normalizedMessage, mb_strtolower($barangay))) {
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
            if (str_contains($normalizedMessage, mb_strtolower($type['name']))) {
                $preferences['rental_type_id'] = $type['id'];
                break;
            }
        }
    }

    if (preg_match('/(\d+)\s*(?:people|persons|occupants|tao)/i', $message, $match)) {
        $preferences['occupancy'] = min(100, max(1, (int) $match[1]));
    }

    if (preg_match('/(\d+)\s*(?:bedroom|bedrooms|br)\b/i', $message, $match)) {
        $preferences['bedroom_no'] = min(20, max(0, (int) $match[1]));
    } elseif (str_contains($normalizedMessage, 'studio')) {
        $preferences['bedroom_no'] = 0;
    }

    foreach ($options['amenities'] as $amenity) {
        $normalizedAmenity = mb_strtolower($amenity);

        if (str_contains($normalizedMessage, $normalizedAmenity)) {
            $preferences['amenities'][] = $amenity;
        }
    }

    $preferences['amenities'] = array_values(array_unique(
        array_slice($preferences['amenities'], 0, 10)
    ));

    $availabilityWords = [
        'available',
        'availability',
        'may rental',
        'may listing',
        'meron ba',
        'mayroon ba',
        'wala ba',
    ];
    $generalWords = [
        'requirement',
        'requirements',
        'deposit',
        'advance',
        'contract',
        'lease',
        'scam',
        'safe',
        'safety',
        'viewing',
        'inspect',
        'move in',
        'renter rights',
        'paano mag rent',
        'paano mag-rent',
    ];
    $intent = 'refine_search';

    foreach ($availabilityWords as $word) {
        if (str_contains($normalizedMessage, $word)) {
            $intent = 'availability_check';
            break;
        }
    }

    if ($intent === 'refine_search') {
        foreach ($generalWords as $word) {
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
        'acknowledgement' => 'I updated the rental search using the details I understood from your message.',
    ];
}

function aiChatHistory(mixed $candidate): array
{
    if (!is_array($candidate)) {
        return [];
    }

    $history = [];

    foreach (array_slice($candidate, -8) as $item) {
        if (!is_array($item)) {
            continue;
        }

        $role = ($item['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
        $message = trim((string) ($item['message'] ?? ''));

        if ($message !== '') {
            $history[] = [
                'role' => $role,
                'message' => mb_substr($message, 0, 500),
            ];
        }
    }

    return $history;
}

function aiChatGeneralFallback(string $message): string
{
    $normalized = mb_strtolower($message);

    if (str_contains($normalized, 'requirement')) {
        return 'Karaniwang hinihingi ang valid ID, proof of income o employment, at payment para sa deposit at advance rent. Depende pa rin ito sa landlord, kaya basahin ang listing at kumpirmahin ang eksaktong requirements bago magbayad.';
    }

    if (str_contains($normalized, 'scam') || str_contains($normalized, 'safe')) {
        return 'Para makaiwas sa scam, huwag munang magbayad bago ma-verify ang property at landlord, tingnan ang unit kung posible, at humingi ng written agreement at official receipt. Gamitin ang SilipMunti property details at messages para manatiling malinaw ang usapan.';
    }

    if (str_contains($normalized, 'contract') || str_contains($normalized, 'lease')) {
        return 'Bago pumirma, tingnan ang monthly rent, deposit at advance, due date, utilities, house rules, repair responsibilities, at termination terms. Humingi ng kopya ng signed agreement at magtanong muna kung may hindi malinaw.';
    }

    if (str_contains($normalized, 'view') || str_contains($normalized, 'inspect')) {
        return 'Sa property viewing, i-check ang locks, tubig, kuryente, leaks, ventilation, signal o internet, ingay, at access sa transport. Kunan din ng litrato ang existing damage at ipa-record ito bago mag-move in.';
    }

    return 'Matutulungan kita sa paghahanap ng rental, budget, requirements, property viewing, lease terms, at renter safety. Sabihin mo lang kung ano ang gusto mong malaman o anong klaseng rental ang hinahanap mo.';
}

function aiChatLocationAvailability(PDO $pdo, array $preferences): array
{
    $barangay = trim((string) $preferences['barangay']);

    if ($barangay === '') {
        return [
            'location_total' => null,
            'matching_total' => null,
        ];
    }

    $baseSql = "
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
          AND l.barangay = :barangay
    ";
    $locationStatement = $pdo->prepare('SELECT COUNT(*) ' . $baseSql);
    $locationStatement->execute(['barangay' => $barangay]);
    $locationTotal = (int) $locationStatement->fetchColumn();
    $matchingSql = 'SELECT COUNT(*) ' . $baseSql;
    $params = ['barangay' => $barangay];

    if ($preferences['budget_max'] !== null) {
        $matchingSql .= ' AND l.price <= :budget_max';
        $params['budget_max'] = (float) $preferences['budget_max'];
    }

    if ($preferences['rental_type_id'] !== null) {
        $matchingSql .= ' AND l.rental_type_id = :rental_type_id';
        $params['rental_type_id'] = (int) $preferences['rental_type_id'];
    }

    if ($preferences['occupancy'] !== null) {
        $matchingSql .= ' AND l.occupancy_limit >= :occupancy';
        $params['occupancy'] = (int) $preferences['occupancy'];
    }

    if ($preferences['bedroom_no'] !== null) {
        $matchingSql .= ' AND l.bedroom_no >= :bedroom_no';
        $params['bedroom_no'] = (int) $preferences['bedroom_no'];
    }

    $matchingStatement = $pdo->prepare($matchingSql);
    $matchingStatement->execute($params);

    return [
        'location_total' => $locationTotal,
        'matching_total' => (int) $matchingStatement->fetchColumn(),
    ];
}

function aiChatNoAvailabilityMessage(
    array $preferences,
    array $availability,
    array $availableBarangays
): string {
    $barangay = $preferences['barangay'];

    if ($availability['location_total'] < 1) {
        $alternatives = array_values(array_filter(
            $availableBarangays,
            static fn (string $item): bool =>
                strcasecmp($item, $barangay) !== 0
        ));
        $alternativeText = $alternatives !== []
            ? ' Maaari kitang maghanap sa ibang available areas gaya ng '
                . implode(', ', array_slice($alternatives, 0, 3))
                . '.'
            : ' Maaari mong subukan ulit kapag may bagong listing na na-post.';

        return 'Sa ngayon, wala pang verified at currently available na rental listing sa '
            . $barangay
            . '.'
            . $alternativeText;
    }

    $budgetText = $preferences['budget_max'] !== null
        ? ' na pasok sa ₱'
            . number_format((float) $preferences['budget_max'], 0)
            . ' maximum budget mo'
        : ' na pasok sa current requirements mo';

    return 'May currently available na rental listing sa '
        . $barangay
        . ', pero wala pang'
        . $budgetText
        . '. Maaari nating taasan ang budget o bawasan ang ibang preferences.';
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
        INNER JOIN users u
            ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
          AND l.barangay IS NOT NULL
          AND TRIM(l.barangay) <> ''
        ORDER BY l.barangay ASC
    ")->fetchAll(PDO::FETCH_COLUMN);
    $officialBarangays = [
        'Alabang',
        'Ayala Alabang',
        'Bayanan',
        'Buli',
        'Cupang',
        'New Alabang Village',
        'Poblacion',
        'Putatan',
        'Sucat',
        'Tunasan',
    ];
    $barangays = array_values(array_unique(array_merge(
        $officialBarangays,
        $availableBarangays
    )));

    $rentalTypes = array_map(
        static fn (array $type): array => [
            'id' => (int) $type['id'],
            'name' => $type['name'],
        ],
        $pdo->query("
            SELECT DISTINCT rt.id, rt.name
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
        ")->fetchAll(PDO::FETCH_ASSOC)
    );

    $amenityRows = $pdo->query("
        SELECT l.amenities
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        WHERE l.deleted_at IS NULL
          AND u.deleted_at IS NULL
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
        'amenities' => array_values($amenities),
    ];
    $blankPreferences = aiChatBlankPreferences();
    $currentPreferences = aiChatNormalizePreferences(
        $data['current_preferences'] ?? [],
        $blankPreferences,
        $options
    );
    $interpretation = extractGeminiRecommendationPreferences(
        $message,
        $currentPreferences,
        $options
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
    $allowedIntents = [
        'refine_search',
        'availability_check',
        'compare_results',
        'listing_question',
        'general_question',
        'help',
        'reset',
    ];
    $intent = in_array(
        $interpretation['intent'] ?? '',
        $allowedIntents,
        true
    )
        ? $interpretation['intent']
        : ($reset ? 'reset' : 'refine_search');
    $history = aiChatHistory($data['history'] ?? []);
    $generalIntents = [
        'compare_results',
        'listing_question',
        'general_question',
        'help',
    ];
    $isGeneralAnswer = !$reset && in_array($intent, $generalIntents, true);
    $availability = aiChatLocationAvailability($pdo, $preferences);
    $hasNoExactAvailability = !$reset
        && !$isGeneralAnswer
        && $preferences['barangay'] !== ''
        && $availability['matching_total'] !== null
        && $availability['matching_total'] < 1;
    $directAnswer = $isGeneralAnswer || $hasNoExactAvailability;
    $responseMode = 'recommendation';
    $aiGeneratedAnswer = false;

    if ($isGeneralAnswer) {
        $generalAnswer = generateGeminiRenterAssistantMessage(
            $message,
            $preferences,
            $history
        );
        $aiGeneratedAnswer = $generalAnswer !== null;
        $acknowledgement = $generalAnswer ?? aiChatGeneralFallback($message);
        $responseMode = 'renter_assistant';
    } elseif ($hasNoExactAvailability) {
        $acknowledgement = aiChatNoAvailabilityMessage(
            $preferences,
            $availability,
            $availableBarangays
        );
        $responseMode = 'database_answer';
    } elseif ($reset) {
        $responseMode = 'reset';
    }

    echo json_encode([
        'success' => true,
        'message' => $acknowledgement !== ''
            ? mb_substr(
                $acknowledgement,
                0,
                $responseMode === 'renter_assistant' ? 1200 : 400
            )
            : 'I updated your rental preferences.',
        'data' => [
            'ai_interpreted' => $aiInterpreted,
            'reset' => $reset,
            'intent' => $intent,
            'direct_answer' => $directAnswer,
            'recommend' => !$directAnswer && !$reset,
            'response_mode' => $responseMode,
            'ai_generated_answer' => $aiGeneratedAnswer,
            'availability' => $availability,
            'preferences' => $preferences,
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to interpret the rental request.',
    ]);
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'The AI rental assistant is temporarily unavailable.',
    ]);
}
