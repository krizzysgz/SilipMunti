<?php

require_once __DIR__ . '/conversation-tools.php';

/** Return null to preserve the existing search/cards/reset pipeline. */
function silipMuntiHandleConversation(
    PDO $pdo, array $data, string $message,
    array $currentPreferences, array $options
): ?array {
    $history = aiChatHistory($data['history'] ?? []);
    $interpretation = extractGeminiRecommendationPreferences(
        $message, $currentPreferences, $options, $history
    );
    $generated = false;
    $listings = [];
    $listingResultReceived = false;
    $preferences = $currentPreferences;

    if ($interpretation !== null) {
        if (!empty($interpretation['reset']) || !empty($interpretation['out_of_scope_city'])) {
            return null;
        }
        $intent = $interpretation['intent'] ?? 'help';
        if (in_array($intent, ['refine_search', 'availability_check', 'reset'], true)) {
            return null;
        }
        $preferences = aiChatNormalizePreferences(
            $interpretation['preferences'] ?? [], $currentPreferences, $options
        );
        $answer = generateGeminiRenterAssistantMessage(
            $message, $preferences, $history, $options,
            static function (string $name, array $args) use ($pdo, &$listings, &$listingResultReceived): array {
                $result = smAiPublicTool($pdo, $name, $args);
                if (in_array($name, ['get_available_listings', 'get_listing_details'], true)) {
                    // Replace earlier broad results with the latest scoped search,
                    // including zero results or a failed query. Never show stale cards.
                    $listingResultReceived = true;
                    $listings = empty($result['error']) && is_array($result['listings'] ?? null)
                        ? $result['listings'] : [];
                }
                return $result;
            }
        );
        $generated = $answer !== null;
    } else {
        $intent = 'help';
        $answer = null;
        // Keep reset usable even when the provider is unavailable.
        $fallback = aiChatFallbackInterpretation($message, $currentPreferences, $options);
        if (!empty($fallback['reset'])) return null;
        // Do not turn a scoped follow-up into an unrelated global search.
        // Normal database filters remain available on the Properties page.

    }

    if ($answer === null) {
        $answer = 'Hindi available ang AI assistant sa ngayon, kaya hindi ko ma-interpret nang maayos ang tanong mo. Puwede mong gamitin muna ang Properties filters o subukan ulit mamaya. Hindi ibig sabihin nito na walang available na listing.';
    }
    return [
        'success' => true,
        'message' => $answer,
        'data' => [
            'ai_interpreted' => $interpretation !== null,
            'reset' => false,
            'intent' => $intent,
            'direct_answer' => true,
            'recommend' => false,
            'response_mode' => 'renter_assistant',
            'ai_generated_answer' => $generated,
            'preferences' => $preferences,
            'listing_results' => $listingResultReceived,
            'recommendations' => $listings,
            'ai_generated' => $generated
        ]
    ];
}
