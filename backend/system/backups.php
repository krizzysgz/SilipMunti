<?php
declare(strict_types=1);
require_once __DIR__ . '/core.php';

function sm_backup_dir(): string {
    $p = sm_private() . '/backups';
    if (!is_dir($p) && !mkdir($p, 0700) && !is_dir($p)) throw new RuntimeException('Cannot create backup directory.');
    return $p;
}
function sm_key(): string {
    $file = sm_private() . '/backup-signing.key';
    if (!is_file($file)) {
        $fp = @fopen($file, 'x');
        if ($fp) { chmod($file, 0600); fwrite($fp, bin2hex(random_bytes(32))); fclose($fp); }
    }
    $key = (string) file_get_contents($file);
    if (strlen($key) !== 64) throw new RuntimeException('Backup signing key is unavailable.');
    return $key;
}
function sm_binary(string $kind): string {
    $variable = $kind === 'dump' ? 'SYSTEM_MYSQLDUMP_PATH' : 'SYSTEM_MYSQL_PATH';
    $names = $kind === 'dump' ? ['mysqldump', 'mariadb-dump'] : ['mysql', 'mariadb'];
    $custom = env_value($variable, '');
    $paths = [];
    if ($custom) $paths[] = $custom;
    else {
        foreach ($names as $name) {
            $paths[] = dirname(sm_root(), 2) . '/mysql/bin/' . $name . '.exe';
            foreach (explode(PATH_SEPARATOR, getenv('PATH') ?: '') as $dir) $paths[] = $dir . DIRECTORY_SEPARATOR . $name . (PHP_OS_FAMILY === 'Windows' ? '.exe' : '');
        }
    }
    foreach ($paths as $path) if (is_file($path) && (PHP_OS_FAMILY === 'Windows' || is_executable($path))) return realpath($path);
    throw new RuntimeException('Configure ' . $variable . ' with the MySQL utility path.');
}
function sm_readiness(): array {
    $issues = [];
    if (!class_exists('ZipArchive')) $issues[] = 'Enable the PHP zip extension.';
    if (!function_exists('proc_open')) $issues[] = 'Enable proc_open for the MySQL utilities.';
    foreach (['dump', 'mysql'] as $kind) { try { sm_binary($kind); } catch (Throwable $e) { $issues[] = $e->getMessage(); } }
    if (!is_writable(sm_private())) $issues[] = 'Private storage is not writable.';
    return ['ready' => !$issues, 'issues' => $issues, 'automatic_backup' => 'Not configured'];
}
function sm_ready(): void { $r = sm_readiness(); if (!$r['ready']) throw new RuntimeException(implode(' ', $r['issues'])); }
function sm_job(): string {
    $p = sm_private() . '/job-' . bin2hex(random_bytes(12));
    if (!mkdir($p, 0700)) throw new RuntimeException('Cannot create backup staging directory.');
    return $p;
}
function sm_remove_tree(string $path): void {
    if (is_link($path) || is_file($path)) { if (!unlink($path)) throw new RuntimeException('Cannot remove staged file.'); return; }
    if (!is_dir($path)) return;
    foreach (new FilesystemIterator($path, FilesystemIterator::SKIP_DOTS) as $f) sm_remove_tree($f->getPathname());
    if (!rmdir($path)) throw new RuntimeException('Cannot remove staged directory.');
}
function sm_mysql(string $kind, string $sqlFile, string $job): void {
    $config = $job . '/client-' . bin2hex(random_bytes(6)) . '.cnf';
    $quote = static fn(string $s): string => '"' . str_replace(["\\", '"', "\n", "\r"], ["\\\\", '\\"', '\\n', '\\r'], $s) . '"';
    $text = "[client]\n";
    foreach (['host' => ['DB_HOST', 'localhost'], 'port' => ['DB_PORT', '3306'], 'user' => ['DB_USERNAME', 'root'], 'password' => ['DB_PASSWORD', '']] as $key => $spec) $text .= $key . '=' . $quote(env_value($spec[0], $spec[1]) ?? '') . "\n";
    $database = env_value('DB_NAME', 'silip_munti');
    if (!$database || str_starts_with($database, '-')) throw new RuntimeException('Invalid database name.');
    $args = [sm_binary($kind), '--defaults-extra-file=' . $config, '--default-character-set=utf8mb4'];
    if ($kind === 'dump') array_push($args, '--single-transaction', '--quick', '--routines', '--events', '--triggers', '--hex-blob', '--no-tablespaces', '--result-file=' . $sqlFile, $database);
    else array_push($args, '--binary-mode=1', $database);
    $stderr = $job . '/mysql-error-' . bin2hex(random_bytes(6)) . '.txt';
    $stdout = $job . '/mysql-output-' . bin2hex(random_bytes(6)) . '.txt';
    $stdin = $kind === 'dump' ? $job . '/empty-input' : $sqlFile;
    if ($kind === 'dump') file_put_contents($stdin, '');
    if (file_put_contents($config, $text) === false) throw new RuntimeException('Cannot create temporary client configuration.');
    chmod($config, 0600);
    try {
        $process = proc_open($args, [0 => ['file', $stdin, 'r'], 1 => ['file', $stdout, 'w'], 2 => ['file', $stderr, 'w']], $pipes, null, null, ['bypass_shell' => true]);
        if (!is_resource($process)) throw new RuntimeException('Cannot start the MySQL utility.');
        $exit = proc_close($process);
        if ($exit !== 0) {
            // Diagnostics stay private; credentials never appear in command arguments or API errors.
            error_log('SilipMunti MySQL utility failed; private diagnostics: ' . $stderr);
            throw new RuntimeException('The MySQL ' . ($kind === 'dump' ? 'export' : 'import') . ' failed. Check the private job diagnostics and MySQL permissions.');
        }
        if ($kind === 'dump' && (!is_file($sqlFile) || filesize($sqlFile) < 20)) throw new RuntimeException('The database export is empty.');
    } finally { if (is_file($config)) unlink($config); }
}
function sm_upload_roots(): array { return ['storage' => sm_root() . '/backend/storage', 'private_uploads' => sm_root() . '/backend/private_uploads']; }
function sm_safe_upload_name(string $name): bool {
    if ($name === '.htaccess') return true;
    return !str_starts_with($name, '.') && !preg_match('/\.(?:php\d*|phtml|phar|cgi|pl|py|sh|exe|bat|cmd|ps1|env|ini|cnf)$/i', $name);
}
function sm_backup_create(int $adminId, string $label = 'Manual backup'): array {
    sm_ready(); $job = sm_job(); $zip = null; $published = false;
    $id = bin2hex(random_bytes(16)); $archive = sm_backup_dir() . '/' . $id . '.zip';
    try {
        $sql = $job . '/database.sql'; sm_mysql('dump', $sql, $job);
        $zip = new ZipArchive();
        if ($zip->open($archive, ZipArchive::CREATE | ZipArchive::EXCL) !== true) throw new RuntimeException('Cannot open the backup archive.');
        $files = []; $bytes = 0;
        $add = static function(string $source, string $target) use ($zip, &$files, &$bytes): void {
            $size = filesize($source); $bytes += $size;
            if ($bytes > 4 * 1024 ** 3 || count($files) >= 50000) throw new RuntimeException('Backup exceeds the supported 4 GB or 50,000 file limit.');
            $hash = hash_file('sha256', $source);
            if (!$hash || !$zip->addFile($source, $target)) throw new RuntimeException('Cannot add a backup file.');
            $files[$target] = ['bytes' => $size, 'sha256' => $hash];
        };
        $add($sql, 'database.sql');
        foreach (sm_upload_roots() as $name => $root) {
            if (is_link($root)) throw new RuntimeException('Upload roots must not be symbolic links.');
            $zip->addEmptyDir('uploads/' . $name);
            if (!is_dir($root)) continue;
            $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
            foreach ($iterator as $file) {
                if ($file->isLink()) throw new RuntimeException('Symbolic links are not supported in upload backups.');
                $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
                $target = 'uploads/' . $name . '/' . $relative;
                if ($file->isDir()) $zip->addEmptyDir($target);
                elseif ($file->isFile()) {
                    if (!sm_safe_upload_name($file->getFilename())) throw new RuntimeException('An unexpected executable or hidden file exists in uploads. Review it before backing up.');
                    $add($file->getPathname(), $target);
                } else throw new RuntimeException('Unsupported upload entry.');
            }
        }
        $created = gmdate('c');
        $manifest = ['format' => 'silipmunti-full-v1', 'database' => env_value('DB_NAME', 'silip_munti'), 'created_at' => $created, 'admin_id' => $adminId, 'files' => $files];
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        if (!$zip->close()) throw new RuntimeException('Cannot finish the backup archive.'); $zip = null; chmod($archive, 0600);
        $metadata = ['id' => $id, 'created_at' => $created, 'label' => $label, 'admin_id' => $adminId, 'bytes' => filesize($archive), 'sha256' => hash_file('sha256', $archive), 'files' => count($files)];
        $payload = json_encode($metadata, JSON_THROW_ON_ERROR);
        sm_atomic(sm_backup_dir() . '/' . $id . '.json', ['payload' => $payload, 'signature' => hash_hmac('sha256', $payload, sm_key())]);
        sm_audit('backup_created', $adminId, ['backup_id' => $id, 'label' => $label]); $published = true;
        return $metadata;
    } finally {
        if ($zip instanceof ZipArchive) $zip->close();
        if (!$published) { if (is_file($archive)) unlink($archive); @unlink(sm_backup_dir() . '/' . $id . '.json'); }
        // Keep failed MySQL diagnostics, but remove SQL and credentials from a failed export job.
        if ($published) sm_remove_tree($job);
        else { @unlink($job . '/database.sql'); }
    }
}
function sm_backup_record(string $id, bool $checkHash = false): array {
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) throw new RuntimeException('Invalid backup ID.');
    $record = sm_json_file(sm_backup_dir() . '/' . $id . '.json');
    if (!isset($record['payload'], $record['signature']) || !is_string($record['payload']) || !is_string($record['signature']) || !hash_equals(hash_hmac('sha256', $record['payload'], sm_key()), $record['signature'])) throw new RuntimeException('Backup metadata is missing or invalid.');
    $data = json_decode($record['payload'], true, 512, JSON_THROW_ON_ERROR);
    $file = sm_backup_dir() . '/' . $id . '.zip';
    if (($data['id'] ?? null) !== $id || !is_file($file) || filesize($file) !== $data['bytes'] || ($checkHash && !hash_equals($data['sha256'], hash_file('sha256', $file)))) throw new RuntimeException('The backup is incomplete or has been modified.');
    return $data;
}
function sm_backup_list(): array {
    $items = [];
    foreach (glob(sm_backup_dir() . '/*.json') ?: [] as $f) {
        try { $items[] = sm_backup_record(basename($f, '.json')); } catch (Throwable $e) { error_log('Invalid SilipMunti backup: ' . basename($f)); }
    }
    usort($items, static fn($a, $b) => strcmp($b['created_at'], $a['created_at'])); return $items;
}
function sm_archive_stage(string $id, string $job): string {
    sm_backup_record($id, true); $zip = new ZipArchive();
    if ($zip->open(sm_backup_dir() . '/' . $id . '.zip') !== true) throw new RuntimeException('Cannot read backup.');
    try {
        if ($zip->numFiles > 100000) throw new RuntimeException('Too many archive entries.');
        $stat = $zip->statName('manifest.json');
        if (!$stat || $stat['size'] > 16 * 1024 ** 2) throw new RuntimeException('Invalid backup manifest.');
        $m = json_decode($zip->getFromName('manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        if (($m['format'] ?? '') !== 'silipmunti-full-v1' || ($m['database'] ?? '') !== env_value('DB_NAME', 'silip_munti') || !is_array($m['files'] ?? null)) throw new RuntimeException('This backup does not match the current database.');
        $stage = $job . '/staged'; mkdir($stage, 0700, true); $seen = []; $bytes = 0;
        foreach (array_keys(sm_upload_roots()) as $root) mkdir($stage . '/uploads/' . $root, 0700, true);
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $s = $zip->statIndex($i); $name = $s['name'];
            if (isset($seen[$name])) throw new RuntimeException('Duplicate archive path.'); $seen[$name] = true;
            if ($name === 'manifest.json') continue;
            if (str_contains($name, '\\') || str_contains($name, ':') || str_contains($name, "\0") || preg_match('~(^|/)\.{1,2}(/|$)~', $name) || !preg_match('~^(?:database\.sql$|uploads/(?:storage|private_uploads)/)~', $name)) throw new RuntimeException('Unsafe archive path.');
            if (str_ends_with($name, '/')) { if (!is_dir($stage . '/' . $name)) mkdir($stage . '/' . $name, 0700, true); continue; }
            if (!isset($m['files'][$name]) || ($name !== 'database.sql' && !sm_safe_upload_name(basename($name)))) throw new RuntimeException('Unexpected archive file.');
            $bytes += $s['size'];
            if ($bytes > 4 * 1024 ** 3 || $s['size'] !== $m['files'][$name]['bytes']) throw new RuntimeException('Invalid archive size.');
            $destination = $stage . '/' . $name;
            if (!is_dir(dirname($destination))) mkdir(dirname($destination), 0700, true);
            $in = $zip->getStream($name); $out = fopen($destination, 'xb');
            if (!$in || !$out) throw new RuntimeException('Cannot stage backup file.');
            try { $copied = stream_copy_to_stream($in, $out, $s['size'] + 1); } finally { fclose($in); fclose($out); }
            chmod($destination, 0600);
            if ($copied !== $s['size'] || !hash_equals($m['files'][$name]['sha256'], hash_file('sha256', $destination))) throw new RuntimeException('A backup file failed integrity verification.');
        }
        foreach ($m['files'] as $name => $entry) if (!isset($seen[$name])) throw new RuntimeException('A backup file is missing.');
        if (!is_file($stage . '/database.sql')) throw new RuntimeException('The database snapshot is missing.');
        return $stage;
    } finally { $zip->close(); }
}
function sm_clear_database(PDO $pdo): void {
    // mysqldump replaces its own tables, but tables created after an old backup must also be removed.
    $quote = static fn(string $identifier): string => '`' . str_replace('`', '``', $identifier) . '`';
    $objects = $pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM);
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    try {
        foreach ($objects as $object) $pdo->exec('DROP ' . ($object[1] === 'VIEW' ? 'VIEW ' : 'TABLE ') . $quote($object[0]));
        $q = $pdo->prepare('SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?');
        $q->execute([env_value('DB_NAME', 'silip_munti')]);
        foreach ($q->fetchAll() as $routine) $pdo->exec('DROP ' . ($routine['ROUTINE_TYPE'] === 'FUNCTION' ? 'FUNCTION ' : 'PROCEDURE ') . $quote($routine['ROUTINE_NAME']));
        $q = $pdo->prepare('SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?');
        $q->execute([env_value('DB_NAME', 'silip_munti')]);
        foreach ($q->fetchAll() as $event) $pdo->exec('DROP EVENT ' . $quote($event['EVENT_NAME']));
    } finally { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); }
}
function sm_backup_restore(PDO $pdo, int $adminId, string $id): array {
    sm_ready();
    if (!sm_state()['enabled']) throw new RuntimeException('Enable maintenance mode before restoring.');
    $job = sm_job(); $moves = []; $importStarted = false; $recovery = null; $keep = false;
    try {
        $stage = sm_archive_stage($id, $job); // Validate everything before modifying live data.
        $q = $pdo->prepare("SELECT id, email, password FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL"); $q->execute([$adminId]); $admin = $q->fetch();
        if (!$admin) throw new RuntimeException('Current administrator is unavailable.');
        $previousMax = (int) $pdo->query('SELECT COALESCE(MAX(session_version), 0) FROM users')->fetchColumn();
        // This recovery snapshot remains in backup history even after successful restoration.
        $recovery = sm_backup_create($adminId, 'Automatic safety snapshot before restore');
        $recoveryJob = sm_archive_stage($recovery['id'], $job . '/recovery');
        $importStarted = true; sm_clear_database($pdo); sm_mysql('mysql', $stage . '/database.sql', $job);
        $q = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL");
        $q->execute([$adminId]);
        if (!$q->fetch()) throw new RuntimeException('The restored database does not contain the current administrator.');
        $restoredMax = (int) $pdo->query('SELECT COALESCE(MAX(session_version), 0) FROM users')->fetchColumn();
        $newVersion = max($previousMax, $restoredMax) + 1;
        if ($newVersion >= 2147483647) throw new RuntimeException('Session version limit reached.');
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE users SET session_version = ?')->execute([$newVersion]);
        $pdo->prepare("UPDATE users SET email = ?, password = ? WHERE id = ? AND role = 'admin'")->execute([$admin['email'], $admin['password'], $adminId]);
        $pdo->commit();
        foreach (sm_upload_roots() as $name => $root) {
            if (is_link($root)) throw new RuntimeException('Cannot restore into a symbolic link.');
            $old = $job . '/old-' . $name;
            $moves[$name] = ['root' => $root, 'old' => $old, 'old_moved' => false, 'new_moved' => false];
            if (is_dir($root)) {
                if (!rename($root, $old)) throw new RuntimeException('Cannot move existing uploads. Private storage must be on the same drive as the project.');
                $moves[$name]['old_moved'] = true;
            }
            if (!rename($stage . '/uploads/' . $name, $root)) throw new RuntimeException('Cannot install restored uploads.');
            $moves[$name]['new_moved'] = true;
            // Public upload images need webserver-readable files; private roots remain protected by Apache.
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
            chmod($root, 0755); foreach ($it as $f) chmod($f->getPathname(), $f->isDir() ? 0755 : 0644);
        }
        sm_audit('restore_completed', $adminId, ['backup_id' => $id, 'recovery_id' => $recovery['id']]);
        if (session_status() !== PHP_SESSION_ACTIVE && !session_start()) throw new RuntimeException('Cannot resume the administrator session.');
        $_SESSION['user_id'] = $adminId; $_SESSION['session_version'] = $newVersion;
        $_SESSION['session_started_at'] = time(); $_SESSION['last_activity'] = time(); $_SESSION['last_regeneration'] = time();
        if (!session_regenerate_id(true)) throw new RuntimeException('Cannot refresh the administrator session.');
        session_write_close();
        return ['recovery_backup_id' => $recovery['id'], 'maintenance_enabled' => true];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        try {
            foreach (array_reverse($moves, true) as $move) {
                if ($move['new_moved']) sm_remove_tree($move['root']);
                if ($move['old_moved'] && !rename($move['old'], $move['root'])) throw new RuntimeException('Cannot recover the original upload directory.');
            }
            if ($importStarted && isset($recoveryJob)) { sm_clear_database($pdo); sm_mysql('mysql', $recoveryJob . '/database.sql', $job); }
            sm_audit('restore_failed_recovered', $adminId, ['backup_id' => $id, 'recovery_id' => $recovery['id'] ?? null]);
        } catch (Throwable $recoveryError) {
            $keep = true; error_log('SilipMunti recovery failed: ' . $recoveryError->getMessage() . '; job: ' . $job);
            throw new RuntimeException('Recovery needs manual intervention. Maintenance remains ON. Keep the private job folder and recovery backup; contact your system maintainer.', 0, $e);
        }
        throw new RuntimeException('Restore did not complete. Original data was retained or recovered. Maintenance remains ON. ' . $e->getMessage(), 0, $e);
    } finally {
        if (!$keep) { try { sm_remove_tree($job); } catch (Throwable $cleanupError) { error_log('SilipMunti staging cleanup failed: ' . $job); } }
    }
}
