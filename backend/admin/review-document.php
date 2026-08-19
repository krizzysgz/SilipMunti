<?php

header('Content-Type: application/json; charset=utf-8');

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

$documentId = filter_var(
    $data['document_id'] ?? null,
    FILTER_VALIDATE_INT
);

$action = trim($data['action'] ?? '');
$rejectionReason = trim($data['rejection_reason'] ?? '');

$errors = [];

if (!$documentId || $documentId < 1) {
    $errors['document_id'] = 'A valid document ID is required.';
}

if (!in_array($action, ['approved', 'rejected'], true)) {
    $errors['action'] = 'Action must be approved or rejected.';
}

if ($action === 'rejected' && $rejectionReason === '') {
    $errors['rejection_reason'] = 'Rejection reason is required.';
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

    $getDocument = $pdo->prepare(
        'SELECT
            id,
            landlord_id,
            document_type,
            verification_status
         FROM verification_documents
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );

    $getDocument->execute([$documentId]);

    $document = $getDocument->fetch();

    if (!$document) {
        $pdo->rollBack();

        http_response_code(404);

        echo json_encode([
            'success' => false,
            'message' => 'Document not found.'
        ]);

        exit;
    }

    if ($document['verification_status'] !== 'pending') {
        $pdo->rollBack();

        http_response_code(409);

        echo json_encode([
            'success' => false,
            'message' => 'This document has already been reviewed.'
        ]);

        exit;
    }

    $updateDocument = $pdo->prepare(
        'UPDATE verification_documents
         SET
            verification_status = ?,
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            rejection_reason = ?
         WHERE id = ?'
    );

    $updateDocument->execute([
        $action,
        $admin['id'],
        $action === 'rejected' ? $rejectionReason : null,
        $documentId
    ]);

    $documentLabel = match ($document['document_type']) {
        'valid_id' => 'valid ID',
        'barangay_clearance' => 'barangay clearance',
        'land_title' => 'land title',
        default => 'verification document'
    };

    if ($action === 'approved') {
        $notificationMessage =
            'Your ' . $documentLabel . ' has been approved.';
    } else {
        $notificationMessage =
            'Your ' . $documentLabel .
            ' has been rejected. Reason: ' .
            $rejectionReason;
    }

    $createNotification = $pdo->prepare(
        'INSERT INTO notifications (
            user_id,
            inquiry_id,
            notification_type,
            message
         ) VALUES (?, NULL, "document_status", ?)'
    );

    $createNotification->execute([
        $document['landlord_id'],
        $notificationMessage
    ]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Document review completed successfully.',
        'data' => [
            'document_id' => (int) $document['id'],
            'verification_status' => $action,
            'reviewed_by' => (int) $admin['id'],
            'rejection_reason' =>
                $action === 'rejected'
                    ? $rejectionReason
                    : null
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
        'message' => 'Unable to complete document review.'
    ]);
}