<?php

function get_landlord_verification_summary(
    PDO $pdo,
    int $landlordId,
    ?string $landlordStatus
): array {
    $requiredDocuments = [
        'valid_id',
        'barangay_clearance',
        'land_title'
    ];

    $statement = $pdo->prepare('
        SELECT DISTINCT document_type
        FROM verification_documents
        WHERE landlord_id = :landlord_id
          AND verification_status = "approved"
          AND deleted_at IS NULL
          AND document_type IN (
              "valid_id",
              "barangay_clearance",
              "land_title"
          )
    ');

    $statement->execute([
        'landlord_id' => $landlordId
    ]);

    $approvedDocuments = $statement->fetchAll(PDO::FETCH_COLUMN);
    $approvedCount = count($approvedDocuments);
    $accountStatus = $landlordStatus ?: 'pending';
    $verificationLevel = 'unverified';

    if ($accountStatus === 'approved') {
        $verificationLevel = $approvedCount === count($requiredDocuments)
            ? 'fully_verified'
            : 'verified';
    }

    return [
        'account_status' => $accountStatus,
        'verification_level' => $verificationLevel,
        'approved_document_count' => $approvedCount,
        'approved_documents' => $approvedDocuments,
        'missing_documents' => array_values(
            array_diff($requiredDocuments, $approvedDocuments)
        ),
        'is_fully_verified' =>
            $verificationLevel === 'fully_verified'
    ];
}
