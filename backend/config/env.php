<?php

function env_value(string $key, ?string $default = null): ?string
{
    static $variables = null;

    if ($variables === null) {
        $envPath = dirname(__DIR__, 2) . '/.env';

        if (!is_file($envPath) || !is_readable($envPath)) {
            throw new RuntimeException('.env file was not found.');
        }

        $variables = parse_ini_file(
            $envPath,
            false,
            INI_SCANNER_RAW
        );

        if (!is_array($variables)) {
            throw new RuntimeException('Unable to read the .env file.');
        }
    }

    $value = $variables[$key] ?? $default;

    if ($value === null) {
        return null;
    }

    return trim((string) $value);
}