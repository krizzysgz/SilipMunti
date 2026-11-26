<?php
declare(strict_types=1);
header('Cache-Control: no-store');
require_once __DIR__ . '/../system/backups.php';
require_once __DIR__ . '/../middleware/auth.php';
$admin = require_role($pdo, ['admin']);
@set_time_limit(0); ignore_user_abort(true);
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $id = $_GET['download'] ?? null;
        if (!is_string($id)) sm_response(['success' => true, 'data' => sm_backup_list()]);
        $record = sm_backup_record($id, true);
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        header('Content-Type: application/zip'); header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . $record['bytes']);
        header('Content-Disposition: attachment; filename="SilipMunti-full-' . $id . '.zip"');
        $fp = fopen(sm_backup_dir() . '/' . $id . '.zip', 'rb');
        if (!$fp) throw new RuntimeException('Cannot read archive.');
        fpassthru($fp); fclose($fp); exit;
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); sm_response(['success' => false, 'message' => 'Method not allowed.'], 405); }
    require_csrf_token(); $input = sm_input(); sm_confirm_password($pdo, $admin['id'], $input);
    $action = $input['action'] ?? '';
    if (!in_array($action, ['create', 'delete', 'restore'], true)) sm_response(['success' => false, 'message' => 'Invalid backup action.'], 422);
    $id = $input['id'] ?? '';
    if ($action !== 'create' && (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id))) sm_response(['success' => false, 'message' => 'Invalid backup ID.'], 422);
    if ($action === 'restore' && ($input['confirmation'] ?? '') !== 'RESTORE') sm_response(['success' => false, 'message' => 'Type RESTORE to confirm.'], 422);
    $data = sm_exclusive(function() use ($action, $id, $admin, $pdo) {
        if ($action === 'create') return sm_backup_create($admin['id']);
        if ($action === 'restore') return sm_backup_restore($pdo, $admin['id'], $id);
        sm_backup_record($id); sm_audit('backup_deleted', $admin['id'], ['backup_id' => $id]);
        if (!unlink(sm_backup_dir() . '/' . $id . '.zip')) throw new RuntimeException('Cannot delete archive.');
        unlink(sm_backup_dir() . '/' . $id . '.json'); return [];
    });
    $messages = ['create' => 'Full backup created: database, pictures, and private documents.', 'delete' => 'Backup deleted.', 'restore' => 'Restore completed. Other users must sign in again. Maintenance remains ON; verify the system before disabling it.'];
    sm_response(['success' => true, 'message' => $messages[$action], 'data' => $data]);
} catch (Throwable $e) { error_log('System backup: ' . $e->getMessage()); sm_response(['success' => false, 'message' => $e->getMessage()], 503); }
