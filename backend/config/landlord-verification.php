<?php
/** Identity verification: only the most recent active Valid ID counts. */
function get_landlord_verification_summary(PDO $pdo, int $landlordId, ?string $landlordStatus): array
{
    $stmt = $pdo->prepare('SELECT id, verification_status FROM verification_documents
        WHERE landlord_id = :id AND document_type = "valid_id" AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 1');
    $stmt->execute(['id' => $landlordId]);
    $latest = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    $idStatus = $latest['verification_status'] ?? 'not_submitted';
    $approved = $idStatus === 'approved';
    $submitted = in_array($idStatus, ['pending', 'approved'], true);
    $accountStatus = $landlordStatus ?: 'pending';
    $level = ($approved && $accountStatus === 'approved') ? 'verified' : 'unverified';
    return [
        'account_status' => $accountStatus,
        'verification_level' => $level,
        'approved_document_count' => $approved ? 1 : 0,
        'approved_documents' => $approved ? ['valid_id'] : [],
        'missing_documents' => $approved ? [] : ['valid_id'],
        'is_fully_verified' => $level === 'verified',
        'valid_id_status' => $idStatus,
        'has_submitted_required_id' => $submitted,
        'can_create_listing' => $submitted && !in_array($accountStatus, ['rejected', 'suspended'], true),
    ];
}
