<?php
declare(strict_types=1);
require_once __DIR__ . '/core.php';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') { header('Allow: GET'); sm_response(['success' => false, 'message' => 'Method not allowed.'], 405); }
try {
    $fp = sm_lock_handle(); $available = flock($fp, LOCK_SH | LOCK_NB);
    $state = sm_state();
    if ($available) flock($fp, LOCK_UN); fclose($fp);
    sm_response(['success' => true, 'data' => ['enabled' => (bool) $state['enabled'], 'busy' => !$available, 'message' => $state['enabled'] ? (string) $state['message'] : null]]);
} catch (Throwable $e) { error_log('System status: ' . $e->getMessage()); sm_response(['success' => false, 'message' => 'System status is temporarily unavailable.'], 503); }
