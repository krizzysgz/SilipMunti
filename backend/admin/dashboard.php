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

try {
    $userCounts = $pdo->query(
        'SELECT
            SUM(role = "renter") AS total_renters,
            SUM(role = "landlord") AS total_landlords,
            SUM(role = "admin") AS total_admins
         FROM users
         WHERE deleted_at IS NULL'
    )->fetch();

    $documentCounts = $pdo->query(
        'SELECT
            SUM(verification_status = "pending") AS pending_documents,
            SUM(verification_status = "approved") AS approved_documents,
            SUM(verification_status = "rejected") AS rejected_documents
         FROM verification_documents
         WHERE deleted_at IS NULL'
    )->fetch();

    $listingCounts = $pdo->query(
        'SELECT
            COUNT(*) AS total_listings,
            SUM(verification_status = "pending") AS pending_listings,
            SUM(verification_status = "verified") AS verified_listings,
            SUM(verification_status = "rejected") AS rejected_listings,
            SUM(
                verification_status = "verified"
                AND availability_status = "available"
            ) AS available_listings,
            SUM(
                verification_status = "verified"
                AND availability_status = "occupied"
            ) AS occupied_listings
         FROM listings
         WHERE deleted_at IS NULL'
    )->fetch();

    echo json_encode([
        'success' => true,
        'message' => 'Admin dashboard data retrieved successfully.',
        'data' => [
            'users' => [
                'renters' =>
                    (int) ($userCounts['total_renters'] ?? 0),
                'landlords' =>
                    (int) ($userCounts['total_landlords'] ?? 0),
                'admins' =>
                    (int) ($userCounts['total_admins'] ?? 0)
            ],
            'documents' => [
                'pending' =>
                    (int) ($documentCounts['pending_documents'] ?? 0),
                'approved' =>
                    (int) ($documentCounts['approved_documents'] ?? 0),
                'rejected' =>
                    (int) ($documentCounts['rejected_documents'] ?? 0)
            ],
            'listings' => [
                'total' =>
                    (int) ($listingCounts['total_listings'] ?? 0),
                'pending' =>
                    (int) ($listingCounts['pending_listings'] ?? 0),
                'verified' =>
                    (int) ($listingCounts['verified_listings'] ?? 0),
                'rejected' =>
                    (int) ($listingCounts['rejected_listings'] ?? 0),
                'available' =>
                    (int) ($listingCounts['available_listings'] ?? 0),
                'occupied' =>
                    (int) ($listingCounts['occupied_listings'] ?? 0)
            ]
        ]
    ]);
} catch (PDOException $exception) {
    error_log($exception->getMessage());

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to retrieve admin dashboard data.'
    ]);
}