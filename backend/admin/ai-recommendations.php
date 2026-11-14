<?php
/** SilipMunti Admin - AI-assisted Executive Recommendations
 * Requires PHP cURL, PHP sessions, and GEMINI_API_KEY in server environment or project .env.
 * Does not modify records. Only aggregate metrics are sent to Google Gemini.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';
$admin = require_role($pdo, ['admin']);

function ai_reply(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    ai_reply(405, ['success' => false, 'message' => 'Method not allowed.']);
}
// Block cross-origin browser requests; session cookies must be same-origin.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $expected = (($_SERVER['HTTPS'] ?? '') === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    if (!hash_equals($expected, $origin)) {
        ai_reply(403, ['success' => false, 'message' => 'Cross-origin requests are not allowed.']);
    }
}
$body = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($body)) ai_reply(400, ['success' => false, 'message' => 'Invalid JSON.']);
// The frontend sends an empty JSON object. Monthly scope is determined by the server,
// not by the selected Admin Reports filters.
// Monthly recommendations are platform-wide, NOT scoped by Admin Reports filters.
// Each successful generation is reused for 30 x 24 hours from its generated_at.
$today = new DateTimeImmutable('today');
$scope = [
    'start_date' => $today->modify('-29 days')->format('Y-m-d'),
    'end_date' => $today->format('Y-m-d'),
    'barangay' => '',
    'rental_type_id' => '',
];
$cacheKey = 'platform-monthly-gemini-v1';
$ttlSeconds = 30 * 24 * 60 * 60;
// Cache is stored in MySQL so it survives page refreshes and server restarts.
// SQL migration provided separately.
function ai_cached(PDO $pdo, string $key): ?array {
    $stmt = $pdo->prepare('SELECT recommendations_json, generated_at FROM ai_executive_recommendations WHERE cache_key = :key LIMIT 1');
    $stmt->execute(['key' => $key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $items = json_decode((string)$row['recommendations_json'], true);
    return is_array($items) ? ['insights' => $items, 'generated_at' => $row['generated_at']] : null;
}
function ai_valid_cache(?array $row, int $seconds): bool {
    return $row !== null && strtotime((string)$row['generated_at']) !== false && (time() - strtotime((string)$row['generated_at'])) < $seconds;
}
function ai_save(PDO $pdo, string $key, array $insights): void {
    $json = json_encode($insights, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $stmt = $pdo->prepare('INSERT INTO ai_executive_recommendations (cache_key, recommendations_json, generated_at)
        VALUES (:cache_key, :recommendations_json, NOW())
        ON DUPLICATE KEY UPDATE recommendations_json = VALUES(recommendations_json), generated_at = NOW()');
    $stmt->execute(['cache_key' => $key, 'recommendations_json' => $json]);
}
try {
    $saved = ai_cached($pdo, $cacheKey);
} catch (Throwable $e) {
    error_log('SilipMunti monthly AI cache unavailable: ' . $e->getMessage());
    ai_reply(503, ['success' => false, 'message' => 'Monthly AI cache table is missing or inaccessible. Import the included database SQL first.']);
}
/**
 * Minimal .env reader for deployments without a dotenv package.
 * Existing process env values take precedence; never expose .env contents.
 * Reads only expected secret/config keys and never evaluates file content.
 */
function ai_env_value(string $name): string {
    $existing = getenv($name);
    if ($existing !== false && trim($existing) !== '') return trim($existing);

    $paths = [
        dirname(__DIR__, 2) . '/.env', // SilipMunti/.env
        dirname(__DIR__) . '/.env',    // SilipMunti/backend/.env
    ];
    foreach ($paths as $path) {
        if (!is_file($path) || !is_readable($path)) continue;
        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false) continue;
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (str_starts_with($line, 'export ')) $line = trim(substr($line, 7));
            $pos = strpos($line, '=');
            if ($pos === false) continue;
            $key = trim(substr($line, 0, $pos));
            if ($key !== $name) continue;
            $value = trim(substr($line, $pos + 1));
            if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'")) {
                $quote = $value[0];
                $closing = strrpos($value, $quote);
                if ($closing > 0) $value = substr($value, 1, $closing - 1);
            } else {
                // Permit inline comments for unquoted values.
                $value = preg_replace('/\s+#.*$/', '', $value) ?? $value;
            }
            return trim($value);
        }
    }
    return '';
}
// Reuse the EXISTING authenticated reporting queries, not client-supplied numbers.
// reports.php has no early exit on success; it returns {success,data} JSON.
$oldGet = $_GET;
$oldMethod = $_SERVER['REQUEST_METHOD'];
$_GET = $scope;
// reports.php is an existing GET-only report endpoint. Run its queries internally.
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
try {
    include __DIR__ . '/reports.php';
    $reportJson = ob_get_clean();
} catch (Throwable $e) {
    ob_end_clean();
    error_log('SilipMunti AI report data: ' . $e->getMessage());
    ai_reply(500, ['success' => false, 'message' => 'Unable to load report analytics.']);
} finally {
    $_GET = $oldGet;
    $_SERVER['REQUEST_METHOD'] = $oldMethod;
}
$report = json_decode($reportJson, true);
if (!is_array($report) || empty($report['success']) || !isset($report['data'])) {
    ai_reply(500, ['success' => false, 'message' => 'Report analytics are unavailable.']);
}
$d = $report['data'];
// Explicit allow-list: never send names, reviews text, contact details or uploaded IDs.
$metrics = [
    'filters' => $scope,
    'overview' => array_intersect_key($d['overview'] ?? [], array_flip(['new_users','active_listings','inquiries','favorites','landlord_response_rate','average_rating','pending_verifications','total_reviews'])),
    'listing_summary' => array_intersect_key($d['listing_summary'] ?? [], array_flip(['total','available','occupied','without_images','stale','average_price'])),
    'inquiries' => array_intersect_key($d['inquiries'] ?? [], array_flip(['total','pending','closed','response_rate','average_response_hours','unanswered_over_48_hours'])),
    'verification' => array_intersect_key($d['verification'] ?? [], array_flip(['submitted','approved','rejected','pending','pending_over_48_hours','average_review_hours'])),
    'reviews' => array_intersect_key($d['reviews'] ?? [], array_flip(['total','average_rating','positive','neutral','negative'])),
    'demand_by_barangay' => array_map(static function ($item) {
        return array_intersect_key($item, array_flip(['barangay','available_listings','inquiries','favorites','demand_score','demand_per_available_listing']));
    }, array_slice($d['demand_by_barangay'] ?? [], 0, 12)),
];

// Verified, deterministic signals act as the source of truth. Gemini can improve
// the suggested actions, but cannot change the actual finding, severity or evidence.
$signals = [];
$pushSignal = static function (string $id, string $type, string $title, string $finding, string $action, string $evidence) use (&$signals): void {
    $signals[] = compact('id', 'type', 'title', 'finding', 'action', 'evidence');
};
$inquiryCount = (int)($metrics['inquiries']['total'] ?? 0);
$unanswered = (int)($metrics['inquiries']['unanswered_over_48_hours'] ?? 0);
$responseRate = (float)($metrics['inquiries']['response_rate'] ?? 0);
$delayedDocs = (int)($metrics['verification']['pending_over_48_hours'] ?? 0);
$missingImages = (int)($metrics['listing_summary']['without_images'] ?? 0);
$staleListings = (int)($metrics['listing_summary']['stale'] ?? 0);
$negativeReviews = (int)($metrics['reviews']['negative'] ?? 0);
$reviewCount = (int)($metrics['reviews']['total'] ?? 0);
$averageRating = (float)($metrics['reviews']['average_rating'] ?? 0);
$demand = $metrics['demand_by_barangay'][0] ?? null;
$liveAlerts = [];
if ($unanswered > 0) {
    $liveAlerts[] = [
        'type' => 'critical', 'title' => 'Unanswered renter inquiries',
        'finding' => "$unanswered inquiries have no landlord response after 48 hours.",
        'action' => 'Follow up with the affected landlords and review the pending conversations.',
        'evidence' => "$unanswered unanswered inquiries from the latest report snapshot."
    ];
}
if ($delayedDocs > 0) {
    $liveAlerts[] = [
        'type' => 'warning', 'title' => 'Delayed document verification',
        'finding' => "$delayedDocs verification documents have been pending for over 48 hours.",
        'action' => 'Prioritize the oldest pending document reviews.',
        'evidence' => "$delayedDocs delayed documents from the latest report snapshot."
    ];
}
// Serve the saved monthly recommendations unchanged until 30 full days pass.
// Only live alerts are recalculated on each request.
if (ai_valid_cache($saved, $ttlSeconds)) {
    ai_reply(200, [
        'success' => true, 'source' => 'hybrid-monthly', 'cached' => true,
        'generated_at' => $saved['generated_at'], 'next_update_at' => date('c', strtotime($saved['generated_at']) + $ttlSeconds),
        'insights' => $saved['insights'], 'live_alerts' => $liveAlerts,
    ]);
}
if ($inquiryCount > 0 && $responseRate < 75) {
    $pushSignal('response_rate', 'warning', 'Landlord response rate needs attention',
        "The response rate is {$responseRate}% in the selected period.",
        'Encourage prompt replies, and monitor response times before escalating.',
        "$inquiryCount total inquiries; {$responseRate}% response rate.");
}
if ($missingImages > 0 || $staleListings > 0) {
    $pushSignal('listing_quality', 'warning', 'Listing quality requires review',
        "$missingImages listings lack images and $staleListings listings have not been updated for 60 days or more.",
        'Ask affected landlords to improve listing completeness and confirm current availability.',
        "$missingImages without images; $staleListings stale listings (current snapshot).");
}
if ($negativeReviews > 0) {
    $pushSignal('negative_reviews', 'warning', 'Customer feedback needs attention',
        "$negativeReviews negative customer reviews were recorded during the selected period.",
        'Review recurring feedback themes and follow up on substantiated concerns.',
        "$negativeReviews negative out of $reviewCount published reviews.");
}
if (is_array($demand) && (int)($demand['demand_score'] ?? 0) > 0) {
    $area = (string)($demand['barangay'] ?? 'A barangay');
    $score = (int)$demand['demand_score'];
    $supply = (int)($demand['available_listings'] ?? 0);
    $pushSignal('rental_demand', $supply === 0 ? 'critical' : 'success', 'Rental interest signal in ' . $area,
        "$area has $score recorded demand points and $supply available listings.",
        'Review this limited signal alongside additional activity before changing rental supply priorities.',
        "$score demand points from inquiries and favorites; $supply available listings.");
}
if ($negativeReviews === 0 && $reviewCount > 0 && $averageRating >= 4) {
    $pushSignal('positive_reviews', 'success', 'Customer ratings are positive',
        "The current period's average rating is {$averageRating}/5.",
        'Maintain service quality and continue reviewing new feedback.',
        "$reviewCount published reviews; {$averageRating}/5 average rating.");
}
if ($signals === []) {
    $pushSignal('limited_activity', 'success', 'Continue monitoring platform activity',
        'No configured operational alert threshold was triggered by the available report metrics.',
        'Continue checking listing freshness, inquiries, and feedback as more data arrives.',
        'The selected reporting scope did not trigger a predefined alert.');
}
// Same priority order as the existing dashboard; cap to avoid overwhelming Admin.
$signals = array_slice($signals, 0, 4);
// Avoid simultaneous Gemini calls when two admins open the report together.
$lock = $pdo->prepare('SELECT GET_LOCK(:lock_name, 3)');
$lock->execute(['lock_name' => 'silipmunti_monthly_ai_v1']);
$lockAcquired = (int)$lock->fetchColumn() === 1;
if (!$lockAcquired) {
    if ($saved !== null) ai_reply(200, [
        'success' => true, 'source' => 'hybrid-monthly', 'cached' => true, 'stale' => true,
        'generated_at' => $saved['generated_at'], 'next_update_at' => null,
        'insights' => $saved['insights'], 'live_alerts' => $liveAlerts,
    ]);
    ai_reply(503, ['success' => false, 'message' => 'Monthly AI generation is in progress. Refresh the report shortly.']);
}
register_shutdown_function(static function () use ($pdo): void {
    try { $pdo->query("SELECT RELEASE_LOCK('silipmunti_monthly_ai_v1')"); } catch (Throwable $e) { /* connection may be closed */ }
});
// Double-check after acquiring lock: another request may have just generated it.
$saved = ai_cached($pdo, $cacheKey);
if (ai_valid_cache($saved, $ttlSeconds)) ai_reply(200, [
    'success' => true, 'source' => 'hybrid-monthly', 'cached' => true,
    'generated_at' => $saved['generated_at'], 'next_update_at' => date('c', strtotime($saved['generated_at']) + $ttlSeconds),
    'insights' => $saved['insights'], 'live_alerts' => $liveAlerts,
]);
$apiKey = ai_env_value('GEMINI_API_KEY');
if ($apiKey === '') $apiKey = ai_env_value('GOOGLE_API_KEY');
if ($apiKey === '') ai_reply(503, ['success' => false, 'message' => 'Gemini API key not found. Check GEMINI_API_KEY in the project root or backend .env file.']);
if (!function_exists('curl_init')) ai_reply(503, ['success' => false, 'message' => 'PHP cURL extension is required.']);

$instructions = 'You are SilipMunti\'s executive recommendations editor for a Philippine rental platform. '
    . 'You will receive verified, rule-derived signals, plus aggregated metrics for context. '
    . 'For EACH signal ID, write ONE short, practical, specific action that an admin can choose to take. '
    . 'Keep each action consistent with that exact signal, the supplied numbers, and the available evidence. '
    . 'Do not introduce additional issues, facts, numbers, legal claims, or people. '
    . 'Do not claim causation or high market demand from a single favorite. '
    . 'Zero inquiries is insufficient evidence to judge landlord responsiveness. '
    . 'Return one recommendation for each signal; do not combine signal IDs or invent IDs. '
    . 'Use professional, concise language. The actions are advisory and require admin approval.';
$schema = [
    'type' => 'OBJECT',
    'properties' => [
        'recommendations' => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'id' => ['type' => 'STRING'],
                    'action' => ['type' => 'STRING'],
                ],
                'required' => ['id', 'action'],
                'propertyOrdering' => ['id', 'action'],
            ],
        ],
    ],
    'required' => ['recommendations'],
];
$model = ai_env_value('GEMINI_MODEL') ?: 'gemini-3.5-flash-lite';
// Only permit valid model identifiers: never allow an env var to change request host/path.
if (!preg_match('/^[a-zA-Z0-9._-]{3,80}$/', $model)) {
    ai_reply(503, ['success' => false, 'message' => 'Invalid GEMINI_MODEL configuration.']);
}
$request = [
    'systemInstruction' => ['parts' => [['text' => $instructions]]],
    'contents' => [[
        'role' => 'user',
        'parts' => [['text' => 'Improve the actions for these VERIFIED signals. Return only matching IDs. Input JSON: '
            . json_encode(['signals' => $signals, 'metrics' => $metrics], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]],
    ]],
    'generationConfig' => [
        'responseMimeType' => 'application/json',
        'responseSchema' => $schema,
        'temperature' => 0.3,
        'maxOutputTokens' => 3000,
    ],
];
$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'x-goog-api-key: ' . $apiKey,
        'Content-Type: application/json',
        'Accept: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($request, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 55,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$raw = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);
if ($raw === false || $http < 200 || $http >= 300) {
    error_log('SilipMunti Gemini API failed: status ' . $http . ' ' . substr($error, 0, 200));
    $message = 'Gemini recommendations are temporarily unavailable. Existing report recommendations remain available.';
    if ($http === 429) $message = 'Gemini quota or rate limit reached. Try again later.';
    if ($http === 401 || $http === 403) $message = 'Gemini API access is denied. Check the server API key and project permissions.';
    if ($http === 404) $message = 'Gemini model not available for this API key. Check GEMINI_MODEL.';
    if ($saved !== null) ai_reply(200, [
        'success' => true, 'source' => 'hybrid-monthly', 'cached' => true, 'stale' => true,
        'generated_at' => $saved['generated_at'], 'next_update_at' => null,
        'insights' => $saved['insights'], 'live_alerts' => $liveAlerts,
    ]);
    ai_reply(502, ['success' => false, 'message' => $message]);
}
$res = json_decode($raw, true);
$outputText = '';
foreach (($res['candidates'][0]['content']['parts'] ?? []) as $part) {
    if (isset($part['text']) && is_string($part['text'])) $outputText .= $part['text'];
}
$parsed = json_decode($outputText, true);
$recommendations = $parsed['recommendations'] ?? null;
if (!is_array($recommendations)) {
    ai_reply(502, ['success' => false, 'message' => 'Gemini returned an unusable response. Existing rule-based recommendations remain available.']);
}
// Merge by trusted signal ID: preserves every factual claim and prevents duplicate cards.
$byId = [];
foreach ($recommendations as $recommendation) {
    if (!is_array($recommendation)) continue;
    $id = (string)($recommendation['id'] ?? '');
    $action = trim((string)($recommendation['action'] ?? ''));
    if ($id !== '' && $action !== '') $byId[$id] = mb_substr($action, 0, 450);
}
$clean = [];
foreach ($signals as $signal) {
    $candidate = $byId[$signal['id']] ?? '';
    // Use AI for action text only. When Gemini omits a signal, keep the safe, defined action.
    if ($candidate !== '') $signal['action'] = $candidate;
    unset($signal['id']);
    $clean[] = $signal;
}
try {
    ai_save($pdo, $cacheKey, $clean);
} catch (Throwable $e) {
    error_log('SilipMunti monthly recommendations save failed: ' . $e->getMessage());
    ai_reply(503, ['success' => false, 'message' => 'AI recommendations could not be saved. Confirm the cache table permissions.']);
}
$generatedAt = date('Y-m-d H:i:s');
ai_reply(200, [
    'success' => true, 'source' => 'hybrid-monthly', 'cached' => false,
    'generated_at' => $generatedAt,
    'next_update_at' => date('c', time() + $ttlSeconds),
    'insights' => $clean, 'live_alerts' => $liveAlerts,
]);
