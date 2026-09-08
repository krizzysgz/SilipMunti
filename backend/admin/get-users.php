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
$landlordStatus = trim($_GET['landlord_status'] ?? 'all');
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

$allowedLandlordStatuses = [
    'all',
    'pending',
    'approved',
    'rejected',
    'suspended'
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

if (!in_array(
    $landlordStatus,
    $allowedLandlordStatuses,
    true
)) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid landlord approval filter.'
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

    if ($landlordStatus !== 'all') {
        $conditions[] = "role = 'landlord'";
        $conditions[] = 'landlord_status = ?';
        $parameters[] = $landlordStatus;
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
            landlord_status,
            landlord_reviewed_at,
            landlord_rejection_reason,
            (
                SELECT COUNT(DISTINCT vd.document_type)
                FROM verification_documents vd
                WHERE vd.landlord_id = users.id
                  AND vd.verification_status = "approved"
                  AND vd.deleted_at IS NULL
                  AND vd.document_type IN (
                      "valid_id",
                      "barangay_clearance",
                      "land_title"
                  )
            ) AS approved_document_count,
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

        if ($user['role'] === 'landlord') {
            $approvedCount =
                (int) ($user['approved_document_count'] ?? 0);

            $user['approved_document_count'] = $approvedCount;
            $user['landlord_status'] =
                $user['landlord_status'] ?: 'pending';
            $user['verification_level'] =
                $user['landlord_status'] === 'approved'
                    ? ($approvedCount === 3
                        ? 'fully_verified'
                        : 'verified')
                    : 'unverified';
        } else {
            $user['approved_document_count'] = 0;
            $user['verification_level'] = null;
        }
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
                'landlord_status' => $landlordStatus,
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
