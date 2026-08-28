<?php

require_once __DIR__ . '/env.php';

$geminiApiKey = env_value('GEMINI_API_KEY');
$geminiModel = env_value(
    'GEMINI_MODEL',
    'gemini-3.5-flash-lite'
);

if (
    !$geminiApiKey
    || $geminiApiKey === 'your_gemini_api_key_here'
) {
    throw new RuntimeException(
        'Gemini API key is not configured.'
    );
}

function extractRentalFilters(string $message): array
{
    global $geminiApiKey, $geminiModel;

    $prompt = "
You are AiReco, the rental filter extraction assistant of SilipMunti.

SilipMunti is a rental housing platform for properties in Muntinlupa City.

Extract the renter's preferences from the message.

Rules:
- Extract only information explicitly provided by the renter.
- Never invent missing information.
- Return null for filters that were not mentioned.
- Prices must be numbers without currency symbols.
- Amenities must always be an array.
- Use short searchable values for barangay and rental type.
- Classify the intent as property_search, greeting, help, or unrelated.

Renter message:
{$message}
";

    $requestBody = [
        'contents' => [
            [
                'role' => 'user',
                'parts' => [
                    [
                        'text' => $prompt
                    ]
                ]
            ]
        ],
        'generationConfig' => [
            'temperature' => 0.1,
            'responseMimeType' => 'application/json',
            'responseSchema' => [
                'type' => 'object',
                'properties' => [
                    'intent' => [
                        'type' => 'string',
                        'enum' => [
                            'property_search',
                            'greeting',
                            'help',
                            'unrelated'
                        ]
                    ],
                    'barangay' => [
                        'type' => 'string',
                        'nullable' => true
                    ],
                    'rental_type' => [
                        'type' => 'string',
                        'nullable' => true
                    ],
                    'min_price' => [
                        'type' => 'number',
                        'nullable' => true
                    ],
                    'max_price' => [
                        'type' => 'number',
                        'nullable' => true
                    ],
                    'bedroom_no' => [
                        'type' => 'integer',
                        'nullable' => true
                    ],
                    'occupancy_limit' => [
                        'type' => 'integer',
                        'nullable' => true
                    ],
                    'amenities' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'string'
                        ]
                    ]
                ],
                'required' => [
                    'intent',
                    'barangay',
                    'rental_type',
                    'min_price',
                    'max_price',
                    'bedroom_no',
                    'occupancy_limit',
                    'amenities'
                ]
            ]
        ]
    ];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        . urlencode($geminiModel)
        . ':generateContent';

    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $geminiApiKey
        ],
        CURLOPT_POSTFIELDS => json_encode($requestBody),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    curl_close($ch);

    if ($response === false || $curlError !== '') {
        throw new RuntimeException(
            'Unable to connect to Gemini API.'
        );
    }

    $responseData = json_decode($response, true);

    if ($httpCode < 200 || $httpCode >= 300) {
        throw new RuntimeException(
            $responseData['error']['message']
            ?? 'Gemini API request failed.'
        );
    }

    $responseText =
        $responseData['candidates'][0]['content']['parts'][0]['text']
        ?? null;

    if (!$responseText) {
        throw new RuntimeException(
            'Gemini returned an empty response.'
        );
    }

    $filters = json_decode($responseText, true);

    if (!is_array($filters)) {
        throw new RuntimeException(
            'Gemini returned invalid filter data.'
        );
    }

    return $filters;
}