<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);

    exit;
}

$admin = require_role($pdo, ['admin']);

$role = trim($_GET['role'] ?? 'all');
$status = trim($_GET['status'] ?? 'active');
$search = trim($_GET['search'] ?? '');

$allowedRoles = [
    'all',
    'renter',
    'landlord',
    'admin'
];

$allowedStatuses = [
    'all',
    'active',
    'deleted'
];

if (!in_array($role, $allowedRoles, true)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid role filter.'
    ]);

    exit;
}

if (!in_array($status, $allowedStatuses, true)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid status filter.'
    ]);

    exit;
}

try {
    $conditions = [];
    $parameters = [];

    if ($role !== 'all') {
        $conditions[] = 'role = ?';
        $parameters[] = $role;
    }

    if ($status === 'active') {
        $conditions[] = 'deleted_at IS NULL';
    }

    if ($status === 'deleted') {
        $conditions[] = 'deleted_at IS NOT NULL';
    }

    if ($search !== '') {
        $conditions[] = '(
            first_name LIKE ?
            OR last_name LIKE ?
            OR email LIKE ?
            OR phone_number LIKE ?
        )';

        $searchValue = '%' . $search . '%';

        $parameters[] = $searchValue;
        $parameters[] = $searchValue;
        $parameters[] = $searchValue;
        $parameters[] = $searchValue;
    }

    $whereClause = '';

    if ($conditions !== []) {
        $whereClause =
            'WHERE ' . implode(' AND ', $conditions);
    }

    $getUsers = $pdo->prepare(
        'SELECT
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            profile_picture,
            created_at,
            updated_at,
            deleted_at
         FROM users
         ' . $whereClause . '
         ORDER BY created_at DESC'
    );

    $getUsers->execute($parameters);

    $users = $getUsers->fetchAll();

    foreach ($users as &$user) {
        $user['id'] = (int) $user['id'];
        $user['status'] =
            $user['deleted_at'] === null
                ? 'active'
                : 'deleted';
    }

    unset($user);

    echo json_encode([
        'success' => true,
        'message' => 'Users retrieved successfully.',
        'data' => [
            'total' => count($users),
            'filters' => [
                'role' => $role,
                'status' => $status,
                'search' => $search
            ],
            'users' => $users
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve users.'
    ]);
}