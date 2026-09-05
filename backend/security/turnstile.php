<?php

require_once __DIR__ . '/../config/env.php';

function turnstile_is_enabled(): bool
{
    $value = strtolower(
        env_value('TURNSTILE_ENABLED', 'false') ?? 'false'
    );

    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function turnstile_site_key(): string
{
    $siteKey = trim(
        env_value('TURNSTILE_SITE_KEY', '') ?? ''
    );

    if ($siteKey === '') {
        throw new RuntimeException(
            'TURNSTILE_SITE_KEY is missing.'
        );
    }

    return $siteKey;
}

function turnstile_secret_key(): string
{
    $secretKey = trim(
        env_value('TURNSTILE_SECRET_KEY', '') ?? ''
    );

    if ($secretKey === '') {
        throw new RuntimeException(
            'TURNSTILE_SECRET_KEY is missing.'
        );
    }

    return $secretKey;
}

function turnstile_allowed_hostnames(): array
{
    $configuredHostnames = env_value(
        'TURNSTILE_ALLOWED_HOSTNAMES',
        ''
    ) ?? '';

    $hostnames = array_values(
        array_unique(
            array_filter(
                array_map(
                    static fn (string $hostname): string =>
                        strtolower(trim($hostname)),
                    explode(',', $configuredHostnames)
                ),
                static fn (string $hostname): bool =>
                    $hostname !== ''
            )
        )
    );

    if ($hostnames === []) {
        throw new RuntimeException(
            'TURNSTILE_ALLOWED_HOSTNAMES is missing.'
        );
    }

    return $hostnames;
}

function turnstile_client_ip(): ?string
{
    $ipAddress = trim(
        (string) ($_SERVER['REMOTE_ADDR'] ?? '')
    );

    if (
        $ipAddress === ''
        || filter_var($ipAddress, FILTER_VALIDATE_IP) === false
    ) {
        return null;
    }

    return $ipAddress;
}

function turnstile_idempotency_key(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

    return vsprintf(
        '%s%s-%s-%s-%s-%s%s%s',
        str_split(bin2hex($bytes), 4)
    );
}

function turnstile_send_verification_request(
    array $payload
): array {
    $endpoint =
        'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    $responseBody = false;
    $responseStatus = 0;

    if (function_exists('curl_init')) {
        $curl = curl_init($endpoint);

        if ($curl === false) {
            throw new RuntimeException(
                'Unable to initialize Turnstile verification.'
            );
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($payload),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json'
            ],
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2
        ]);

        $responseBody = curl_exec($curl);
        $responseStatus = (int) curl_getinfo(
            $curl,
            CURLINFO_RESPONSE_CODE
        );
        $curlError = curl_error($curl);

        curl_close($curl);

        if ($responseBody === false) {
            throw new RuntimeException(
                'Turnstile verification request failed: '
                . ($curlError !== '' ? $curlError : 'unknown error')
            );
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' =>
                    "Content-Type: application/x-www-form-urlencoded\r\n"
                    . "Accept: application/json\r\n",
                'content' => http_build_query($payload),
                'timeout' => 10,
                'ignore_errors' => true
            ]
        ]);

        $responseBody = @file_get_contents(
            $endpoint,
            false,
            $context
        );

        if ($responseBody === false) {
            throw new RuntimeException(
                'Turnstile verification request failed.'
            );
        }

        foreach ($http_response_header ?? [] as $headerLine) {
            if (
                preg_match(
                    '/^HTTP\/\S+\s+(\d{3})/',
                    $headerLine,
                    $matches
                )
            ) {
                $responseStatus = (int) $matches[1];
                break;
            }
        }
    }

    if ($responseStatus !== 200) {
        throw new RuntimeException(
            'Turnstile returned HTTP status ' . $responseStatus . '.'
        );
    }

    $result = json_decode($responseBody, true);

    if (!is_array($result)) {
        throw new RuntimeException(
            'Turnstile returned an invalid response.'
        );
    }

    return $result;
}

function turnstile_verify_token(
    string $token,
    string $expectedAction
): array {
    if (!turnstile_is_enabled()) {
        return [
            'success' => false,
            'reason' => 'turnstile_disabled'
        ];
    }

    $normalizedToken = trim($token);
    $normalizedAction = trim($expectedAction);

    if (
        $normalizedToken === ''
        || strlen($normalizedToken) > 2048
    ) {
        return [
            'success' => false,
            'reason' => 'missing_or_invalid_token'
        ];
    }

    if (
        $normalizedAction === ''
        || preg_match(
            '/^[A-Za-z0-9_-]{1,32}$/',
            $normalizedAction
        ) !== 1
    ) {
        throw new InvalidArgumentException(
            'Invalid expected Turnstile action.'
        );
    }

    $payload = [
        'secret' => turnstile_secret_key(),
        'response' => $normalizedToken,
        'idempotency_key' => turnstile_idempotency_key()
    ];

    $clientIp = turnstile_client_ip();

    if ($clientIp !== null) {
        $payload['remoteip'] = $clientIp;
    }

    try {
        $result = turnstile_send_verification_request($payload);
    } catch (Throwable $exception) {
        error_log($exception->getMessage());

        return [
            'success' => false,
            'reason' => 'verification_service_unavailable'
        ];
    }

    if (($result['success'] ?? false) !== true) {
        $errorCodes = $result['error-codes'] ?? [];

        if (is_array($errorCodes) && $errorCodes !== []) {
            error_log(
                'Turnstile validation failed: '
                . implode(', ', array_map('strval', $errorCodes))
            );
        }

        return [
            'success' => false,
            'reason' => 'challenge_failed'
        ];
    }

    $responseHostname = strtolower(
        trim((string) ($result['hostname'] ?? ''))
    );

    if (
        $responseHostname === ''
        || !in_array(
            $responseHostname,
            turnstile_allowed_hostnames(),
            true
        )
    ) {
        error_log('Turnstile hostname validation failed.');

        return [
            'success' => false,
            'reason' => 'hostname_mismatch'
        ];
    }

    $responseAction = trim(
        (string) ($result['action'] ?? '')
    );

    if (!hash_equals($normalizedAction, $responseAction)) {
        error_log('Turnstile action validation failed.');

        return [
            'success' => false,
            'reason' => 'action_mismatch'
        ];
    }

    return [
        'success' => true,
        'reason' => null,
        'hostname' => $responseHostname,
        'action' => $responseAction
    ];
}
