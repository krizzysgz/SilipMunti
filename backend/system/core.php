<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/env.php';

function sm_root(): string { return dirname(__DIR__, 2); }
function sm_private(): string {
    static $path;
    if ($path !== null) return $path;
    $candidate = env_value('SYSTEM_STORAGE_PATH', dirname(sm_root(), 2) . '/silipmunti-private');
    if (!is_string($candidate) || $candidate === '') throw new RuntimeException('Private storage is not configured.');
    if (!is_dir($candidate) && !mkdir($candidate, 0700, true) && !is_dir($candidate)) throw new RuntimeException('Cannot create private storage.');
    $resolved = realpath($candidate);
    $documentRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? dirname(sm_root())));
    foreach (array_filter([$documentRoot, realpath(sm_root())]) as $public) {
        $a = strtolower(str_replace('\\', '/', $resolved)) . '/';
        $b = strtolower(str_replace('\\', '/', $public)) . '/';
        if (str_starts_with($a, $b)) throw new RuntimeException('SYSTEM_STORAGE_PATH must be outside the web root.');
    }
    $path = $resolved;
    return $path;
}
function sm_json_file(string $file): array {
    if (!is_file($file)) return [];
    $result = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($result)) throw new RuntimeException('Invalid system state.');
    return $result;
}
function sm_atomic(string $file, array $data): void {
    $tmp = $file . '.' . bin2hex(random_bytes(8)) . '.tmp';
    try {
        if (file_put_contents($tmp, json_encode($data, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT), LOCK_EX) === false) throw new RuntimeException('Cannot save system state.');
        chmod($tmp, 0600);
        // PHP rename replaces an existing destination on supported Windows and Unix runtimes.
        if (!rename($tmp, $file)) throw new RuntimeException('Cannot replace system state.');
    } finally { if (is_file($tmp)) unlink($tmp); }
}
function sm_state(): array {
    return array_merge(['enabled' => false, 'message' => 'SilipMunti is under maintenance. Please try again later.', 'updated_at' => null], sm_json_file(sm_private() . '/maintenance.json'));
}
function sm_audit(string $action, int $adminId, array $details = []): void {
    $line = json_encode(['at' => gmdate('c'), 'admin_id' => $adminId, 'action' => $action, 'details' => $details], JSON_THROW_ON_ERROR) . "\n";
    if (file_put_contents(sm_private() . '/audit.jsonl', $line, FILE_APPEND | LOCK_EX) === false) throw new RuntimeException('Cannot write system audit.');
}
function sm_response(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE); exit;
}
function sm_unavailable(bool $html = false, ?string $message = null): never {
    $message ??= sm_state()['message'];
    http_response_code(503); header('Retry-After: 60'); header('Cache-Control: no-store');
    if (!$html) sm_response(['success' => false, 'code' => 'maintenance_mode', 'message' => $message], 503);
    header('Content-Type: text/html; charset=utf-8');
    require_once __DIR__ . '/../config/error-pages.php';
    silip_error_html_headers();
    echo silip_error_html(503);
    exit;
}
function sm_lock_handle() {
    $fp = fopen(sm_private() . '/operations.lock', 'c+');
    if (!$fp) throw new RuntimeException('Cannot open system lock.');
    return $fp;
}
function sm_request_lock(bool $html = false): void {
    if (isset($GLOBALS['sm_request_lock'])) return;
    $fp = sm_lock_handle();
    if (!flock($fp, LOCK_SH | LOCK_NB)) { fclose($fp); sm_unavailable($html, 'A system backup or recovery is in progress. Please try again shortly.'); }
    $GLOBALS['sm_request_lock'] = $fp;
    register_shutdown_function('sm_release_request_lock');
}
function sm_release_request_lock(): void {
    if (isset($GLOBALS['sm_request_lock'])) { flock($GLOBALS['sm_request_lock'], LOCK_UN); fclose($GLOBALS['sm_request_lock']); unset($GLOBALS['sm_request_lock']); }
}
function sm_is_admin(PDO $pdo): bool {
    require_once __DIR__ . '/../config/session.php';
    $id = $_SESSION['user_id'] ?? null; $version = $_SESSION['session_version'] ?? null;
    if ((!is_int($id) && !ctype_digit((string) $id)) || !is_int($version)) return false;
    $q = $pdo->prepare("SELECT session_version FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL LIMIT 1"); $q->execute([(int) $id]);
    $row = $q->fetch(); return $row && (int) $row['session_version'] === $version;
}
function sm_runtime_gate(PDO $pdo): void {
    sm_request_lock(defined('SM_FRONTEND_GATEWAY'));
    if (defined('SM_FRONTEND_GATEWAY')) return;
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $allowed = ['login.php', 'admin-login.php', 'status.php', 'logout.php', 'csrf-token.php'];
    if (str_contains((string) $path, '/backend/auth/') && in_array(basename((string) $path), $allowed, true)) return;
    if (sm_state()['enabled'] && !sm_is_admin($pdo)) sm_unavailable();
}
function sm_exclusive(callable $work): mixed {
    // Close the session before waiting: another request may own a shared lock while waiting for this session.
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    sm_release_request_lock(); $fp = sm_lock_handle(); $deadline = microtime(true) + 30;
    while (!flock($fp, LOCK_EX | LOCK_NB)) {
        if (microtime(true) > $deadline) { fclose($fp); throw new RuntimeException('The system is busy. Try again when other requests finish.'); }
        usleep(100000);
    }
    try { return $work(); } finally { flock($fp, LOCK_UN); fclose($fp); }
}
function sm_input(): array {
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) sm_response(['success' => false, 'message' => 'A JSON request is required.'], 400);
    return $body;
}
function sm_confirm_password(PDO $pdo, int $id, array $input): void {
    require_once __DIR__ . '/../middleware/rate-limiter.php';
    $identity = 'system-admin-' . $id;
    $limit = auth_rate_limit_check($pdo, 'login', $identity);
    if ($limit['blocked']) { header('Retry-After: ' . max(1, (int) $limit['retry_after'])); sm_response(['success' => false, 'message' => 'Too many password attempts. Try again later.'], 429); }
    $q = $pdo->prepare("SELECT password FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL"); $q->execute([$id]); $row = $q->fetch();
    $password = $input['password'] ?? null;
    if (!$row || !is_string($password) || strlen($password) > 255 || !password_verify($password, $row['password'])) {
        auth_rate_limit_record_failure($pdo, 'login', $identity);
        sm_response(['success' => false, 'message' => 'Your administrator password is incorrect.'], 403);
    }
    auth_rate_limit_clear_success($pdo, 'login', $identity);
}
