<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../system/backups.php';
require_once __DIR__ . '/../middleware/auth.php';
$admin = require_role($pdo, ['admin']);
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $q = $pdo->prepare('SELECT COUNT(*) AS tables_count, COALESCE(SUM(data_length + index_length), 0) AS size_bytes FROM information_schema.tables WHERE table_schema = ?');
        $q->execute([env_value('DB_NAME', 'silip_munti')]); $database = $q->fetch();
        sm_response(['success' => true, 'data' => ['maintenance' => sm_state(), 'database' => ['connected' => true, 'tables' => (int) $database['tables_count'], 'bytes' => (int) $database['size_bytes']], 'backup' => sm_readiness(), 'backups' => sm_backup_list()]]);
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); sm_response(['success' => false, 'message' => 'Method not allowed.'], 405); }
    require_csrf_token(); $input = sm_input(); sm_confirm_password($pdo, $admin['id'], $input);
    if (!is_bool($input['enabled'] ?? null)) sm_response(['success' => false, 'message' => 'A maintenance status is required.'], 422);
    $message = $input['message'] ?? '';
    if (!is_string($message) || trim($message) === '' || strlen($message) > 1000) sm_response(['success' => false, 'message' => 'Enter a maintenance message of 1–1,000 bytes.'], 422);
    $state = sm_exclusive(function() use ($input, $message, $admin) {
        $state = ['enabled' => $input['enabled'], 'message' => trim($message), 'updated_at' => gmdate('c'), 'updated_by' => $admin['id']];
        sm_audit('maintenance_changed', $admin['id'], ['enabled' => $input['enabled']]);
        sm_atomic(sm_private() . '/maintenance.json', $state); return $state;
    });
    sm_response(['success' => true, 'message' => $state['enabled'] ? 'Maintenance mode is ON. Administrator access remains available.' : 'The system is active.', 'data' => $state]);
} catch (Throwable $e) { error_log('System settings: ' . $e->getMessage()); sm_response(['success' => false, 'message' => 'Unable to update system settings. ' . $e->getMessage()], 503); }
