<?php

function env_value(string $key, ?string $default = null): ?string
{
    static $variables = null;

    if ($variables === null) {
        $envPaths = [
            dirname(__DIR__) . '/.env',
            dirname(__DIR__, 2) . '/.env'
        ];

        $envPath = null;

        foreach ($envPaths as $candidatePath) {
            if (is_file($candidatePath) && is_readable($candidatePath)) {
                $envPath = $candidatePath;
                break;
            }
        }

        if ($envPath === null) {
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