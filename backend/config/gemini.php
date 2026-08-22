<?php

require_once __DIR__ . '/env.php';

$geminiApiKey = env_value('GEMINI_API_KEY');
$geminiModel = env_value(
    'GEMINI_MODEL',
    'gemini-2.5-flash-lite'
);

if (
    !$geminiApiKey
    || $geminiApiKey === 'your_gemini_api_key_here'
) {
    throw new RuntimeException(
        'Gemini API key is not configured.'
    );
}