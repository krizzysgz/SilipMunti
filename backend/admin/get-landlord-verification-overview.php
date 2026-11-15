<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}
require_role($pdo, ['admin']);

$search = trim((string) ($_GET['search'] ?? ''));
if (mb_strlen($search) > 150) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Search is too long.']);
    exit;
}

try {
    // Start from users instead of verification_documents: includes fresh accounts.
    $sql = 'SELECT u.id, u.first_name, u.last_name, u.email
            FROM users u
            WHERE u.role = "landlord" AND u.deleted_at IS NULL';
    $params = [];
    if ($search !== '') {
        $sql .= ' AND (u.first_name LIKE :first_name OR u.last_name LIKE :last_name
                       OR u.email LIKE :email OR CONCAT(u.first_name, " ", u.last_name) LIKE :full_name)';
        $like = '%' . $search . '%';
        $params = ['first_name' => $like, 'last_name' => $like, 'email' => $like, 'full_name' => $like];
    }
    $sql .= ' ORDER BY u.created_at DESC, u.id DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $landlords = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($landlords as &$landlord) { $landlord['id'] = (int) $landlord['id']; }
    unset($landlord);

    $ids = array_column($landlords, 'id');
    $documents = [];
    if ($ids !== []) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            'SELECT vd.id, vd.landlord_id, vd.document_type, vd.verification_status, vd.created_at
             FROM verification_documents vd
             WHERE vd.deleted_at IS NULL
               AND vd.landlord_id IN (' . $placeholders . ')
               AND vd.document_type = "valid_id"
             ORDER BY vd.created_at DESC, vd.id DESC'
        );
        $stmt->execute($ids);
        $documents = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($documents as &$doc) {
            $doc['id'] = (int) $doc['id'];
            $doc['landlord_id'] = (int) $doc['landlord_id'];
        }
        unset($doc);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Landlord verification overview loaded.',
        'data' => [
            'total' => count($landlords),
            'landlords' => $landlords,
            'documents' => $documents,
        ],
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load landlord verification overview.']);
}
