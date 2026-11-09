<?php

function silip_error_is_document_request(): bool
{
    if (PHP_SAPI === 'cli') {
        return false;
    }

    $destination = strtolower(trim(
        (string) ($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '')
    ));

    if ($destination !== '') {
        return in_array(
            $destination,
            ['document', 'iframe', 'frame'],
            true
        );
    }

    $accept = strtolower(
        (string) ($_SERVER['HTTP_ACCEPT'] ?? '')
    );

    return str_contains($accept, 'text/html')
        && !str_contains($accept, 'application/json');
}

function silip_error_details(int $status): array
{
    return match ($status) {
        400 => [
            'Invalid request',
            'This request could not be understood.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ],
        401 => [
            'Please sign in',
            'Sign in to your account to continue.',
            'Sign in',
            '/SilipMunti/frontend/pages/auth/login.html'
        ],
        403 => [
            'Access restricted',
            'Your account does not have permission to view this page.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ],
        404 => [
            'Page not found',
            'The page or resource you requested could not be found.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ],
        405 => [
            'Request not supported',
            'This address does not support that request method.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ],
        419 => [
            'Session verification expired',
            'Refresh the page and try again.',
            'Try again',
            ''
        ],
        429 => [
            'Please wait a moment',
            'Too many requests were received. Please wait before trying again.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ],
        500 => [
            'Something went wrong',
            'We could not complete your request. Please try again shortly.',
            'Try again',
            ''
        ],
        503 => [
            'Temporarily unavailable',
            'This service is currently unavailable. Please try again shortly.',
            'Try again',
            ''
        ],
        default => [
            'Request could not be completed',
            'Please return to the homepage or try again later.',
            'Back to home',
            '/SilipMunti/frontend/index.html'
        ]
    };
}

function silip_error_html(int $status): string
{
    [$title, $description, $button, $destination] =
        silip_error_details($status);

    $escape = static fn (string $value): string =>
        htmlspecialchars(
            $value,
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );

    $title = $escape($title);
    $description = $escape($description);
    $button = $escape($button);
    $destination = $escape($destination);

    return <<<HTML
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="color-scheme" content="dark">
    <title>{$status} — {$title} | SilipMunti</title>
    <link
        rel="stylesheet"
        href="/SilipMunti/frontend/assets/css/error-pages.css?v=1"
    >
</head>
<body class="system-error-page">
    <main class="system-error" aria-labelledby="error-title">
        <a
            class="error-brand"
            href="/SilipMunti/frontend/index.html"
            aria-label="SilipMunti homepage"
        >SILIP<span>MUNTI</span></a>

        <p class="error-code">{$status}</p>

        <h1 id="error-title">{$title}</h1>

        <p class="error-description">{$description}</p>

        <span class="error-divider" aria-hidden="true"></span>

        <a class="error-action" href="{$destination}">
            {$button}
        </a>

        <a
            class="error-home"
            href="/SilipMunti/frontend/index.html"
        >Return to SilipMunti</a>
    </main>
</body>
</html>
HTML;
}

function silip_error_html_headers(): void
{
    header_remove('Content-Length');
    header_remove('Content-Disposition');

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

function silip_enable_browser_error_pages(): void
{
    static $enabled = false;

    if (
        $enabled
        || !silip_error_is_document_request()
        || headers_sent()
    ) {
        return;
    }

    $enabled = true;

    // Only document navigation is buffered.
    // Fetch/XHR responses retain their original JSON.
    ob_start(static function (
        string $body,
        int $phase
    ): string {
        if (($phase & PHP_OUTPUT_HANDLER_CLEAN) !== 0) {
            return $body;
        }

        $status = (int) http_response_code();

        if (
            $status < 400
            || $status > 599
            || headers_sent()
        ) {
            return $body;
        }

        silip_error_html_headers();

        return silip_error_html($status);
    });
}