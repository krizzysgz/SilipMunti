<?php

header('Content-Type: application/json');

require_once '../config/gemini.php';

try {
    $filters = extractRentalFilters(
        'Naghahanap ako ng apartment sa Alabang na below 10000 para sa dalawang tao.'
    );

    echo json_encode([
        'success' => true,
        'message' => 'Gemini connection is working.',
        'data' => [
            'filters' => $filters
        ]
    ]);
} catch (Throwable $e) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}