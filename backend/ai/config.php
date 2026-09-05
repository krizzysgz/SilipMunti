<?php

function silipMuntiLoadEnvironment(): void
{
    static $loaded = false;

    if ($loaded) {
        return;
    }

    $loaded = true;
    $environmentPath = dirname(__DIR__) . '/.env';

    if (!is_file($environmentPath) || !is_readable($environmentPath)) {
        return;
    }

    $lines = file($environmentPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = array_map('trim', explode('=', $line, 2));

        if ($key === '' || getenv($key) !== false) {
            continue;
        }

        $lastCharacter = strlen($value) > 0
            ? $value[strlen($value) - 1]
            : '';

        if (
            strlen($value) >= 2
            && (($value[0] === '"' && $lastCharacter === '"')
                || ($value[0] === "'" && $lastCharacter === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
    }
}

function silipMuntiEnvironment(string $key, ?string $default = null): ?string
{
    silipMuntiLoadEnvironment();
    $value = getenv($key);

    return $value === false || trim($value) === ''
        ? $default
        : trim($value);
}
