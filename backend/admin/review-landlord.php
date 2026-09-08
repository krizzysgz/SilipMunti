<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

$admin = require_role($pdo, ['admin']);
$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    $data = $_POST;
}

$landlordId = filter_var(
    $data['landlord_id'] ?? $data['user_id'] ?? null,
    FILTER_VALIDATE_INT
);
$action = strtolower(trim((string) ($data['action'] ?? '')));
$rejectionReason = trim((string) ($data['rejection_reason'] ?? ''));
$errors = [];

if (!$landlordId || $landlordId < 1) {
    $errors['landlord_id'] = 'A valid landlord ID is required.';
}

if (!in_array($action, ['approved', 'rejected'], true)) {
    $errors['action'] = 'Action must be approved or rejected.';
}

if ($action === 'rejected' && $rejectionReason === '') {
    $errors['rejection_reason'] = 'A rejection reason is required.';
} elseif (mb_strlen($rejectionReason) > 500) {
    $errors['rejection_reason'] =
        'The rejection reason must not exceed 500 characters.';
}

if ($errors !== []) {
    http_response_code(422);

    echo json_encode([
        'success' => false,
        'message' => 'Validation failed.',
        'errors' => $errors
    ]);
    exit;
}

try {
    $pdo->beginTransaction();

    $getLandlord = $pdo->prepare('
        SELECT
            id,
            first_name,
            last_name,
            landlord_status
        FROM users
        WHERE id = :landlord_id
          AND role = "landlord"
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
    ');

    $getLandlord->execute([
        'landlord_id' => $landlordId
    ]);

    $landlord = $getLandlord->fetch();

    if (!$landlord) {
        $pdo->rollBack();
        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Active landlord account not found.'
        ]);
        exit;
    }

    if ($landlord['landlord_status'] === $action) {
        $pdo->rollBack();
        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' =>
                'The landlord account already has this status.'
        ]);
        exit;
    }

    $updateLandlord = $pdo->prepare('
        UPDATE users
        SET
            landlord_status = :landlord_status,
            landlord_reviewed_by = :reviewed_by,
            landlord_reviewed_at = CURRENT_TIMESTAMP,
            landlord_rejection_reason = :rejection_reason,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :landlord_id
    ');

    $updateLandlord->execute([
        'landlord_status' => $action,
        'reviewed_by' => $admin['id'],
        'rejection_reason' =>
            $action === 'rejected' ? $rejectionReason : null,
        'landlord_id' => $landlordId
    ]);

    $notificationMessage = $action === 'approved'
        ? 'Your landlord account has been approved. You can now create and manage rental listings.'
        : 'Your landlord account was not approved. Reason: ' . $rejectionReason;

    $createNotification = $pdo->prepare('
        INSERT INTO notifications (
            user_id,
            inquiry_id,
            notification_type,
            message
        ) VALUES (
            :user_id,
            NULL,
            "account_verified",
            :message
        )
    ');

    $createNotification->execute([
        'user_id' => $landlordId,
        'message' => $notificationMessage
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => $action === 'approved'
            ? 'Landlord account approved successfully.'
            : 'Landlord account rejected successfully.',
        'data' => [
            'landlord_id' => (int) $landlord['id'],
            'landlord_status' => $action,
            'reviewed_by' => (int) $admin['id'],
            'rejection_reason' =>
                $action === 'rejected' ? $rejectionReason : null
        ]
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($exception->getMessage());
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to review the landlord account.'
    ]);
}
