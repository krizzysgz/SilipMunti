<?php
declare(strict_types=1);

/** Resolve the public mount from the executing script's URL and filesystem paths. */
function sm_public_base(): string
{
    static $base;
    if ($base !== null) {
        return $base;
    }

    $root = str_replace('\\', '/', (string) realpath(dirname(__DIR__, 2)));
    $file = str_replace('\\', '/', (string) realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')));
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    if (!str_starts_with($file, $root . '/') || !str_starts_with($script, '/')) {
        return $base = '';
    }

    $relativeFile = substr($file, strlen($root));
    $decodedScript = rawurldecode($script);
    if (!str_ends_with($decodedScript, $relativeFile)) {
        return $base = '';
    }

    $mount = substr($decodedScript, 0, -strlen($relativeFile));
    return $base = implode('/', array_map('rawurlencode', explode('/', $mount)));
}

/** Build a same-origin URL from a path relative to the application root. */
function sm_public_url(string $path): string
{
    return sm_public_base() . '/' . ltrim($path, '/');
}
