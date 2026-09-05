<?php

require_once __DIR__ . '/env.php';

$host = env_value('DB_HOST', 'localhost');
$port = env_value('DB_PORT', '3306');
$dbname = env_value('DB_NAME', 'silip_munti');
$username = env_value('DB_USERNAME', 'root');
$password = env_value('DB_PASSWORD', '');

if (
    $host === null
    || $port === null
    || !ctype_digit($port)
    || (int) $port < 1
    || (int) $port > 65535
    || $dbname === null
    || $dbname === ''
    || $username === null
) {
    error_log('Database configuration is invalid.');
    http_response_code(500);
    exit('Database configuration error.');
}

try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4",
        $username,
        $password ?? '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false
        ]
    );
} catch (PDOException $e) {
    error_log($e->getMessage());
    http_response_code(500);
    exit('Database connection failed.');
}
