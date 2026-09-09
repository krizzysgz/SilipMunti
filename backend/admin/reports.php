<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

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

function report_fail(string $message, int $status = 422): never
{
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
    exit;
}

function report_date(string $value, string $label): DateTimeImmutable
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    if (!$date || $date->format('Y-m-d') !== $value) {
        report_fail($label . ' must use the YYYY-MM-DD format.');
    }

    return $date;
}

function report_row(PDO $pdo, string $sql, array $parameters = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    return $statement->fetch() ?: [];
}

function report_rows(PDO $pdo, string $sql, array $parameters = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    return $statement->fetchAll();
}

function report_listing_scope(
    string $alias,
    string $barangay,
    ?int $rentalTypeId,
    string $prefix
): array {
    $clauses = [];
    $parameters = [];

    if ($barangay !== '') {
        $key = $prefix . '_barangay';
        $clauses[] = $alias . '.barangay = :' . $key;
        $parameters[$key] = $barangay;
    }

    if ($rentalTypeId !== null) {
        $key = $prefix . '_rental_type';
        $clauses[] = $alias . '.rental_type_id = :' . $key;
        $parameters[$key] = $rentalTypeId;
    }

    return [
        'sql' => $clauses === [] ? '' : ' AND ' . implode(' AND ', $clauses),
        'parameters' => $parameters
    ];
}

function report_percentage(int $current, int $previous): ?float
{
    if ($previous === 0) {
        return $current === 0 ? 0.0 : null;
    }

    return round((($current - $previous) / $previous) * 100, 1);
}

$today = new DateTimeImmutable('today');
$defaultStart = $today->modify('first day of this month');
$startValue = trim($_GET['start_date'] ?? $defaultStart->format('Y-m-d'));
$endValue = trim($_GET['end_date'] ?? $today->format('Y-m-d'));
$barangay = trim($_GET['barangay'] ?? '');
$rentalTypeValue = trim((string) ($_GET['rental_type_id'] ?? ''));

$startDate = report_date($startValue, 'Start date');
$endDate = report_date($endValue, 'End date');

if ($startDate > $endDate) {
    report_fail('Start date must not be later than end date.');
}

$periodDays = (int) $startDate->diff($endDate)->days + 1;

if ($periodDays > 366) {
    report_fail('Report date range must not exceed 366 days.');
}

if (mb_strlen($barangay) > 100) {
    report_fail('Barangay filter is too long.');
}

$rentalTypeId = null;

if ($rentalTypeValue !== '') {
    if (!ctype_digit($rentalTypeValue) || (int) $rentalTypeValue < 1) {
        report_fail('Rental type filter is invalid.');
    }

    $rentalTypeId = (int) $rentalTypeValue;
}

$periodStart = $startDate->format('Y-m-d 00:00:00');
$periodEnd = $endDate->modify('+1 day')->format('Y-m-d 00:00:00');
$previousStartDate = $startDate->modify('-' . $periodDays . ' days');
$previousStart = $previousStartDate->format('Y-m-d 00:00:00');
$previousEnd = $periodStart;
$trendFormat = $periodDays > 62
    ? "DATE_FORMAT({alias}.created_at, '%Y-%m-01')"
    : 'DATE({alias}.created_at)';

try {
    if ($rentalTypeId !== null) {
        $typeExists = report_row(
            $pdo,
            'SELECT id FROM rental_types WHERE id = :id LIMIT 1',
            ['id' => $rentalTypeId]
        );

        if ($typeExists === []) {
            report_fail('Selected rental type was not found.', 404);
        }
    }

    $rentalTypes = report_rows(
        $pdo,
        'SELECT id, name
         FROM rental_types
         WHERE deleted_at IS NULL
         ORDER BY name ASC'
    );

    foreach ($rentalTypes as &$rentalType) {
        $rentalType['id'] = (int) $rentalType['id'];
    }
    unset($rentalType);

    $overviewScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'overview'
    );

    $listingSummary = report_row(
        $pdo,
        'SELECT
            COUNT(*) AS total_listings,
            SUM(l.availability_status = "available") AS available_listings,
            SUM(l.availability_status = "occupied") AS occupied_listings,
            SUM(
                NOT EXISTS (
                    SELECT 1
                    FROM listing_images li
                    WHERE li.listing_id = l.id
                      AND li.deleted_at IS NULL
                )
            ) AS listings_without_images,
            SUM(
                COALESCE(l.updated_at, l.created_at)
                < DATE_SUB(NOW(), INTERVAL 60 DAY)
            ) AS stale_listings,
            AVG(l.price) AS average_price
         FROM listings l
         WHERE l.deleted_at IS NULL
           AND l.verification_status = "verified"' .
           $overviewScope['sql'],
        $overviewScope['parameters']
    );

    $newUsersRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM users
         WHERE deleted_at IS NULL
           AND created_at >= :period_start
           AND created_at < :period_end',
        [
            'period_start' => $periodStart,
            'period_end' => $periodEnd
        ]
    );

    $previousUsersRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM users
         WHERE deleted_at IS NULL
           AND created_at >= :previous_start
           AND created_at < :previous_end',
        [
            'previous_start' => $previousStart,
            'previous_end' => $previousEnd
        ]
    );

    $inquiryScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'inquiry_overview'
    );

    $inquiryRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM inquiries i
         INNER JOIN listings l ON l.id = i.listing_id
         WHERE i.deleted_at IS NULL
           AND l.deleted_at IS NULL
           AND i.created_at >= :period_start
           AND i.created_at < :period_end' .
           $inquiryScope['sql'],
        array_merge([
            'period_start' => $periodStart,
            'period_end' => $periodEnd
        ], $inquiryScope['parameters'])
    );

    $previousInquiryScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'previous_inquiry'
    );

    $previousInquiryRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM inquiries i
         INNER JOIN listings l ON l.id = i.listing_id
         WHERE i.deleted_at IS NULL
           AND l.deleted_at IS NULL
           AND i.created_at >= :previous_start
           AND i.created_at < :previous_end' .
           $previousInquiryScope['sql'],
        array_merge([
            'previous_start' => $previousStart,
            'previous_end' => $previousEnd
        ], $previousInquiryScope['parameters'])
    );

    $favoriteScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'favorite_overview'
    );

    $favoriteRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM favorites f
         INNER JOIN listings l ON l.id = f.listing_id
         WHERE l.deleted_at IS NULL
           AND f.saved_at >= :period_start
           AND f.saved_at < :period_end' .
           $favoriteScope['sql'],
        array_merge([
            'period_start' => $periodStart,
            'period_end' => $periodEnd
        ], $favoriteScope['parameters'])
    );

    $reviewScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'review_overview'
    );
    $reviewFilter = $reviewScope['sql'];

    if ($barangay !== '' || $rentalTypeId !== null) {
        $reviewFilter = ' AND r.review_type = "listing"' . $reviewFilter;
    }

    $reviewSummary = report_row(
        $pdo,
        'SELECT
            COUNT(*) AS total_reviews,
            AVG(r.rating) AS average_rating,
            SUM(r.rating >= 4) AS positive_reviews,
            SUM(r.rating = 3) AS neutral_reviews,
            SUM(r.rating <= 2) AS negative_reviews,
            SUM(r.review_type = "platform") AS platform_reviews,
            SUM(r.review_type = "listing") AS listing_reviews
         FROM reviews r
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.created_at >= :period_start
           AND r.created_at < :period_end' .
           $reviewFilter,
        array_merge([
            'period_start' => $periodStart,
            'period_end' => $periodEnd
        ], $reviewScope['parameters'])
    );

    $previousReviewScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'previous_review'
    );
    $previousReviewFilter = $previousReviewScope['sql'];

    if ($barangay !== '' || $rentalTypeId !== null) {
        $previousReviewFilter =
            ' AND r.review_type = "listing"' . $previousReviewFilter;
    }

    $previousReviewRow = report_row(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM reviews r
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.created_at >= :previous_start
           AND r.created_at < :previous_end' .
           $previousReviewFilter,
        array_merge([
            'previous_start' => $previousStart,
            'previous_end' => $previousEnd
        ], $previousReviewScope['parameters'])
    );

    $pendingVerification = report_row(
        $pdo,
        'SELECT
            COUNT(*) AS pending_documents,
            SUM(created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))
                AS pending_over_48_hours
         FROM verification_documents
         WHERE deleted_at IS NULL
           AND verification_status = "pending"'
    );

    $demandScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'demand'
    );

    $demandRows = report_rows(
        $pdo,
        'SELECT
            l.barangay,
            COUNT(*) AS total_listings,
            SUM(l.availability_status = "available") AS available_listings,
            AVG(CASE
                WHEN l.availability_status = "available" THEN l.price
                ELSE NULL
            END) AS average_price,
            SUM(COALESCE(iq.total_inquiries, 0)) AS inquiries,
            SUM(COALESCE(fq.total_favorites, 0)) AS favorites
         FROM listings l
         LEFT JOIN (
            SELECT listing_id, COUNT(*) AS total_inquiries
            FROM inquiries
            WHERE deleted_at IS NULL
              AND created_at >= :demand_inquiry_start
              AND created_at < :demand_inquiry_end
            GROUP BY listing_id
         ) iq ON iq.listing_id = l.id
         LEFT JOIN (
            SELECT listing_id, COUNT(*) AS total_favorites
            FROM favorites
            WHERE saved_at >= :demand_favorite_start
              AND saved_at < :demand_favorite_end
            GROUP BY listing_id
         ) fq ON fq.listing_id = l.id
         WHERE l.deleted_at IS NULL
           AND l.verification_status = "verified"' .
           $demandScope['sql'] . '
         GROUP BY l.barangay
         ORDER BY
            (SUM(COALESCE(iq.total_inquiries, 0)) * 2
             + SUM(COALESCE(fq.total_favorites, 0))) DESC,
            available_listings ASC,
            l.barangay ASC
         LIMIT 12',
        array_merge([
            'demand_inquiry_start' => $periodStart,
            'demand_inquiry_end' => $periodEnd,
            'demand_favorite_start' => $periodStart,
            'demand_favorite_end' => $periodEnd
        ], $demandScope['parameters'])
    );

    foreach ($demandRows as &$demand) {
        $demand['total_listings'] = (int) $demand['total_listings'];
        $demand['available_listings'] = (int) $demand['available_listings'];
        $demand['average_price'] = round((float) ($demand['average_price'] ?? 0), 2);
        $demand['inquiries'] = (int) $demand['inquiries'];
        $demand['favorites'] = (int) $demand['favorites'];
        $demand['demand_score'] =
            ($demand['inquiries'] * 2) + $demand['favorites'];
        $demand['demand_per_available_listing'] =
            $demand['available_listings'] > 0
                ? round(
                    $demand['demand_score'] /
                    $demand['available_listings'],
                    2
                )
                : ($demand['demand_score'] > 0 ? null : 0.0);
    }
    unset($demand);

    $topListingScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'top_listing'
    );

    $topListings = report_rows(
        $pdo,
        'SELECT
            l.id,
            l.title,
            l.barangay,
            l.price,
            l.availability_status,
            rt.name AS rental_type,
            CONCAT(u.first_name, " ", u.last_name) AS landlord_name,
            COALESCE(iq.total_inquiries, 0) AS inquiries,
            COALESCE(fq.total_favorites, 0) AS favorites,
            COALESCE(rq.total_reviews, 0) AS total_reviews,
            COALESCE(rq.average_rating, 0) AS average_rating
         FROM listings l
         INNER JOIN rental_types rt ON rt.id = l.rental_type_id
         INNER JOIN users u ON u.id = l.landlord_id
         LEFT JOIN (
            SELECT listing_id, COUNT(*) AS total_inquiries
            FROM inquiries
            WHERE deleted_at IS NULL
              AND created_at >= :top_inquiry_start
              AND created_at < :top_inquiry_end
            GROUP BY listing_id
         ) iq ON iq.listing_id = l.id
         LEFT JOIN (
            SELECT listing_id, COUNT(*) AS total_favorites
            FROM favorites
            WHERE saved_at >= :top_favorite_start
              AND saved_at < :top_favorite_end
            GROUP BY listing_id
         ) fq ON fq.listing_id = l.id
         LEFT JOIN (
            SELECT
                listing_id,
                COUNT(*) AS total_reviews,
                AVG(rating) AS average_rating
            FROM reviews
            WHERE deleted_at IS NULL
              AND status = "published"
              AND review_type = "listing"
              AND created_at >= :top_review_start
              AND created_at < :top_review_end
            GROUP BY listing_id
         ) rq ON rq.listing_id = l.id
         WHERE l.deleted_at IS NULL
           AND l.verification_status = "verified"' .
           $topListingScope['sql'] . '
         ORDER BY
            (COALESCE(iq.total_inquiries, 0) * 2
             + COALESCE(fq.total_favorites, 0)
             + COALESCE(rq.total_reviews, 0)) DESC,
            l.created_at DESC
         LIMIT 10',
        array_merge([
            'top_inquiry_start' => $periodStart,
            'top_inquiry_end' => $periodEnd,
            'top_favorite_start' => $periodStart,
            'top_favorite_end' => $periodEnd,
            'top_review_start' => $periodStart,
            'top_review_end' => $periodEnd
        ], $topListingScope['parameters'])
    );

    foreach ($topListings as &$listing) {
        $listing['id'] = (int) $listing['id'];
        $listing['price'] = (float) $listing['price'];
        $listing['inquiries'] = (int) $listing['inquiries'];
        $listing['favorites'] = (int) $listing['favorites'];
        $listing['total_reviews'] = (int) $listing['total_reviews'];
        $listing['average_rating'] = round((float) $listing['average_rating'], 2);
        $listing['engagement_score'] =
            ($listing['inquiries'] * 2)
            + $listing['favorites']
            + $listing['total_reviews'];
    }
    unset($listing);

    $inquiryMetricScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'inquiry_metric'
    );

    $inquiryMetrics = report_row(
        $pdo,
        'SELECT
            COUNT(*) AS total_inquiries,
            SUM(report_inquiry.inquiry_status = "pending") AS pending_inquiries,
            SUM(report_inquiry.inquiry_status = "closed") AS closed_inquiries,
            SUM(report_inquiry.first_response_at IS NOT NULL) AS responded_inquiries,
            AVG(CASE
                WHEN report_inquiry.first_response_at IS NOT NULL
                THEN TIMESTAMPDIFF(
                    MINUTE,
                    report_inquiry.created_at,
                    report_inquiry.first_response_at
                )
                ELSE NULL
            END) AS average_response_minutes,
            SUM(
                report_inquiry.first_response_at IS NULL
                AND report_inquiry.created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
            ) AS unanswered_over_48_hours
         FROM (
            SELECT
                i.id,
                i.inquiry_status,
                i.created_at,
                (
                    SELECT MIN(m.created_at)
                    FROM messages m
                    WHERE m.inquiry_id = i.id
                      AND m.sender_id = l.landlord_id
                      AND m.deleted_at IS NULL
                ) AS first_response_at
            FROM inquiries i
            INNER JOIN listings l ON l.id = i.listing_id
            WHERE i.deleted_at IS NULL
              AND l.deleted_at IS NULL
              AND i.created_at >= :metric_start
              AND i.created_at < :metric_end' .
              $inquiryMetricScope['sql'] . '
         ) report_inquiry',
        array_merge([
            'metric_start' => $periodStart,
            'metric_end' => $periodEnd
        ], $inquiryMetricScope['parameters'])
    );

    $totalInquiries = (int) ($inquiryMetrics['total_inquiries'] ?? 0);
    $respondedInquiries = (int) ($inquiryMetrics['responded_inquiries'] ?? 0);
    $responseRate = $totalInquiries > 0
        ? round(($respondedInquiries / $totalInquiries) * 100, 1)
        : 0.0;

    $landlordScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'landlord'
    );

    $landlords = report_rows(
        $pdo,
        'SELECT
            u.id,
            CONCAT(u.first_name, " ", u.last_name) AS landlord_name,
            u.landlord_status,
            (
                SELECT COUNT(DISTINCT vd.document_type)
                FROM verification_documents vd
                WHERE vd.landlord_id = u.id
                  AND vd.deleted_at IS NULL
                  AND vd.verification_status = "approved"
                  AND vd.document_type IN (
                    "valid_id",
                    "barangay_clearance",
                    "land_title"
                  )
            ) AS approved_document_count,
            COUNT(DISTINCT l.id) AS active_listings,
            COALESCE(SUM(l.availability_status = "available"), 0)
                AS available_listings,
            COALESCE(SUM(iq.total_inquiries), 0) AS inquiries,
            COALESCE(SUM(iq.responded_inquiries), 0) AS responded_inquiries,
            COALESCE(SUM(rq.total_reviews), 0) AS total_reviews,
            COALESCE(
                SUM(rq.rating_total) / NULLIF(SUM(rq.total_reviews), 0),
                0
            ) AS average_rating
         FROM users u
         LEFT JOIN listings l
           ON l.landlord_id = u.id
          AND l.deleted_at IS NULL
          AND l.verification_status = "verified"' .
          $landlordScope['sql'] . '
         LEFT JOIN (
            SELECT
                i.listing_id,
                COUNT(*) AS total_inquiries,
                SUM(
                    EXISTS (
                        SELECT 1
                        FROM messages m
                        INNER JOIN listings owner_listing
                            ON owner_listing.id = i.listing_id
                        WHERE m.inquiry_id = i.id
                          AND m.sender_id = owner_listing.landlord_id
                          AND m.deleted_at IS NULL
                    )
                ) AS responded_inquiries
            FROM inquiries i
            WHERE i.deleted_at IS NULL
              AND i.created_at >= :landlord_inquiry_start
              AND i.created_at < :landlord_inquiry_end
            GROUP BY i.listing_id
         ) iq ON iq.listing_id = l.id
         LEFT JOIN (
            SELECT
                listing_id,
                COUNT(*) AS total_reviews,
                SUM(rating) AS rating_total
            FROM reviews
            WHERE deleted_at IS NULL
              AND status = "published"
              AND review_type = "listing"
              AND created_at >= :landlord_review_start
              AND created_at < :landlord_review_end
            GROUP BY listing_id
         ) rq ON rq.listing_id = l.id
         WHERE u.deleted_at IS NULL
           AND u.role = "landlord"
         GROUP BY
            u.id,
            u.first_name,
            u.last_name,
            u.landlord_status
         HAVING active_listings > 0
             OR inquiries > 0
             OR total_reviews > 0
         ORDER BY inquiries DESC, active_listings DESC, average_rating DESC
         LIMIT 10',
        array_merge([
            'landlord_inquiry_start' => $periodStart,
            'landlord_inquiry_end' => $periodEnd,
            'landlord_review_start' => $periodStart,
            'landlord_review_end' => $periodEnd
        ], $landlordScope['parameters'])
    );

    foreach ($landlords as &$landlord) {
        $landlord['id'] = (int) $landlord['id'];
        $landlord['approved_document_count'] =
            (int) $landlord['approved_document_count'];
        $landlord['active_listings'] = (int) $landlord['active_listings'];
        $landlord['available_listings'] = (int) $landlord['available_listings'];
        $landlord['inquiries'] = (int) $landlord['inquiries'];
        $landlord['responded_inquiries'] =
            (int) $landlord['responded_inquiries'];
        $landlord['total_reviews'] = (int) $landlord['total_reviews'];
        $landlord['average_rating'] = round((float) $landlord['average_rating'], 2);
        $landlord['response_rate'] = $landlord['inquiries'] > 0
            ? round(
                ($landlord['responded_inquiries'] / $landlord['inquiries']) * 100,
                1
            )
            : 0.0;
        $landlord['verification_level'] =
            $landlord['landlord_status'] === 'approved'
                ? ($landlord['approved_document_count'] === 3
                    ? 'fully_verified'
                    : 'verified')
                : 'unverified';
    }
    unset($landlord);

    $verificationPeriod = report_row(
        $pdo,
        'SELECT
            COUNT(*) AS submitted_documents,
            SUM(verification_status = "approved") AS approved_documents,
            SUM(verification_status = "rejected") AS rejected_documents,
            AVG(CASE
                WHEN reviewed_at IS NOT NULL
                THEN TIMESTAMPDIFF(MINUTE, created_at, reviewed_at)
                ELSE NULL
            END) AS average_review_minutes
         FROM verification_documents
         WHERE deleted_at IS NULL
           AND created_at >= :verification_start
           AND created_at < :verification_end',
        [
            'verification_start' => $periodStart,
            'verification_end' => $periodEnd
        ]
    );

    $rejectionReasons = report_rows(
        $pdo,
        'SELECT
            COALESCE(NULLIF(TRIM(rejection_reason), ""), "No reason provided")
                AS reason,
            COUNT(*) AS total
         FROM verification_documents
         WHERE deleted_at IS NULL
           AND verification_status = "rejected"
           AND created_at >= :reason_start
           AND created_at < :reason_end
         GROUP BY reason
         ORDER BY total DESC, reason ASC
         LIMIT 6',
        [
            'reason_start' => $periodStart,
            'reason_end' => $periodEnd
        ]
    );

    foreach ($rejectionReasons as &$reason) {
        $reason['total'] = (int) $reason['total'];
    }
    unset($reason);

    $reviewDistribution = report_rows(
        $pdo,
        'SELECT r.rating, COUNT(*) AS total
         FROM reviews r
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.created_at >= :distribution_start
           AND r.created_at < :distribution_end' .
           $reviewFilter . '
         GROUP BY r.rating
         ORDER BY r.rating DESC',
        array_merge([
            'distribution_start' => $periodStart,
            'distribution_end' => $periodEnd
        ], $reviewScope['parameters'])
    );

    $distribution = [
        '5' => 0,
        '4' => 0,
        '3' => 0,
        '2' => 0,
        '1' => 0
    ];

    foreach ($reviewDistribution as $ratingRow) {
        $distribution[(string) (int) $ratingRow['rating']] =
            (int) $ratingRow['total'];
    }

    $reviewComments = report_rows(
        $pdo,
        'SELECT r.rating, r.comment
         FROM reviews r
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.created_at >= :theme_start
           AND r.created_at < :theme_end' .
           $reviewFilter . '
         ORDER BY r.created_at DESC
         LIMIT 1000',
        array_merge([
            'theme_start' => $periodStart,
            'theme_end' => $periodEnd
        ], $reviewScope['parameters'])
    );

    $themeKeywords = [
        'Landlord response' => [
            'reply', 'response', 'respond', 'sumagot', 'sagot', 'replied'
        ],
        'Property availability' => [
            'available', 'availability', 'occupied', 'unavailable', 'wala na'
        ],
        'Listing accuracy' => [
            'photo', 'picture', 'description', 'accurate', 'mali', 'iba'
        ],
        'Pricing' => [
            'price', 'pricing', 'presyo', 'mahal', 'budget', 'affordable'
        ],
        'Website experience' => [
            'website', 'system', 'navigation', 'search', 'filter', 'slow', 'mabagal'
        ]
    ];
    $reviewThemes = [];

    foreach ($themeKeywords as $label => $keywords) {
        $matches = 0;
        $negativeMatches = 0;

        foreach ($reviewComments as $reviewComment) {
            $comment = mb_strtolower((string) $reviewComment['comment']);
            $matched = false;

            foreach ($keywords as $keyword) {
                if (mb_stripos($comment, $keyword) !== false) {
                    $matched = true;
                    break;
                }
            }

            if ($matched) {
                $matches++;

                if ((int) $reviewComment['rating'] <= 2) {
                    $negativeMatches++;
                }
            }
        }

        if ($matches > 0) {
            $reviewThemes[] = [
                'theme' => $label,
                'mentions' => $matches,
                'negative_mentions' => $negativeMatches
            ];
        }
    }

    usort($reviewThemes, static function (array $left, array $right): int {
        return $right['mentions'] <=> $left['mentions'];
    });

    $negativeReviewScope = report_listing_scope(
        'l',
        $barangay,
        $rentalTypeId,
        'negative_review'
    );
    $negativeReviewFilter = $negativeReviewScope['sql'];

    if ($barangay !== '' || $rentalTypeId !== null) {
        $negativeReviewFilter =
            ' AND r.review_type = "listing"' . $negativeReviewFilter;
    }

    $negativeReviews = report_rows(
        $pdo,
        'SELECT
            r.id,
            r.rating,
            r.comment,
            r.review_type,
            r.created_at,
            CASE
                WHEN u.last_name IS NULL OR u.last_name = ""
                    THEN u.first_name
                ELSE CONCAT(u.first_name, " ", LEFT(u.last_name, 1), ".")
            END AS customer_name,
            COALESCE(l.title, "SilipMunti Platform") AS subject
         FROM reviews r
         INNER JOIN users u ON u.id = r.renter_id
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.rating <= 2
           AND r.created_at >= :negative_start
           AND r.created_at < :negative_end' .
           $negativeReviewFilter . '
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 8',
        array_merge([
            'negative_start' => $periodStart,
            'negative_end' => $periodEnd
        ], $negativeReviewScope['parameters'])
    );

    foreach ($negativeReviews as &$negativeReview) {
        $negativeReview['id'] = (int) $negativeReview['id'];
        $negativeReview['rating'] = (int) $negativeReview['rating'];
    }
    unset($negativeReview);

    $roleCounts = report_row(
        $pdo,
        'SELECT
            SUM(role = "renter") AS renters,
            SUM(role = "landlord") AS landlords,
            SUM(role = "admin") AS admins
         FROM users
         WHERE deleted_at IS NULL'
    );

    $trendData = [];
    $trendQueries = [
        'users' => [
            'sql' => 'SELECT ' . str_replace('{alias}', 'u', $trendFormat) . ' AS report_date,
                             COUNT(*) AS total
                      FROM users u
                      WHERE u.deleted_at IS NULL
                        AND u.created_at >= :trend_start
                        AND u.created_at < :trend_end
                      GROUP BY report_date',
            'parameters' => []
        ],
        'listings' => [
            'scope' => report_listing_scope(
                'l',
                $barangay,
                $rentalTypeId,
                'trend_listing'
            )
        ],
        'inquiries' => [
            'scope' => report_listing_scope(
                'l',
                $barangay,
                $rentalTypeId,
                'trend_inquiry'
            )
        ],
        'reviews' => [
            'scope' => report_listing_scope(
                'l',
                $barangay,
                $rentalTypeId,
                'trend_review'
            )
        ]
    ];

    $trendQueries['listings']['sql'] =
        'SELECT ' . str_replace('{alias}', 'l', $trendFormat) . ' AS report_date,
                COUNT(*) AS total
         FROM listings l
         WHERE l.deleted_at IS NULL
           AND l.created_at >= :trend_start
           AND l.created_at < :trend_end' .
           $trendQueries['listings']['scope']['sql'] . '
         GROUP BY report_date';
    $trendQueries['listings']['parameters'] =
        $trendQueries['listings']['scope']['parameters'];

    $trendQueries['inquiries']['sql'] =
        'SELECT ' . str_replace('{alias}', 'i', $trendFormat) . ' AS report_date,
                COUNT(*) AS total
         FROM inquiries i
         INNER JOIN listings l ON l.id = i.listing_id
         WHERE i.deleted_at IS NULL
           AND i.created_at >= :trend_start
           AND i.created_at < :trend_end' .
           $trendQueries['inquiries']['scope']['sql'] . '
         GROUP BY report_date';
    $trendQueries['inquiries']['parameters'] =
        $trendQueries['inquiries']['scope']['parameters'];

    $trendReviewFilter = $trendQueries['reviews']['scope']['sql'];

    if ($barangay !== '' || $rentalTypeId !== null) {
        $trendReviewFilter =
            ' AND r.review_type = "listing"' . $trendReviewFilter;
    }

    $trendQueries['reviews']['sql'] =
        'SELECT ' . str_replace('{alias}', 'r', $trendFormat) . ' AS report_date,
                COUNT(*) AS total
         FROM reviews r
         LEFT JOIN listings l ON l.id = r.listing_id
         WHERE r.deleted_at IS NULL
           AND r.status = "published"
           AND r.created_at >= :trend_start
           AND r.created_at < :trend_end' .
           $trendReviewFilter . '
         GROUP BY report_date';
    $trendQueries['reviews']['parameters'] =
        $trendQueries['reviews']['scope']['parameters'];

    foreach ($trendQueries as $metric => $trendQuery) {
        $rows = report_rows(
            $pdo,
            $trendQuery['sql'],
            array_merge([
                'trend_start' => $periodStart,
                'trend_end' => $periodEnd
            ], $trendQuery['parameters'])
        );

        foreach ($rows as $row) {
            $dateKey = (string) $row['report_date'];

            if (!isset($trendData[$dateKey])) {
                $trendData[$dateKey] = [
                    'date' => $dateKey,
                    'users' => 0,
                    'listings' => 0,
                    'inquiries' => 0,
                    'reviews' => 0
                ];
            }

            $trendData[$dateKey][$metric] = (int) $row['total'];
        }
    }

    ksort($trendData);

    $currentUsers = (int) ($newUsersRow['total'] ?? 0);
    $previousUsers = (int) ($previousUsersRow['total'] ?? 0);
    $currentInquiries = (int) ($inquiryRow['total'] ?? 0);
    $previousInquiries = (int) ($previousInquiryRow['total'] ?? 0);
    $currentReviews = (int) ($reviewSummary['total_reviews'] ?? 0);
    $previousReviews = (int) ($previousReviewRow['total'] ?? 0);

    echo json_encode([
        'success' => true,
        'message' => 'Admin report data retrieved successfully.',
        'data' => [
            'generated_at' => date('Y-m-d H:i:s'),
            'generated_by' => trim(
                ($admin['first_name'] ?? '') . ' ' .
                ($admin['last_name'] ?? '')
            ),
            'filters' => [
                'start_date' => $startDate->format('Y-m-d'),
                'end_date' => $endDate->format('Y-m-d'),
                'barangay' => $barangay,
                'rental_type_id' => $rentalTypeId,
                'period_days' => $periodDays
            ],
            'rental_types' => $rentalTypes,
            'overview' => [
                'new_users' => $currentUsers,
                'active_listings' =>
                    (int) ($listingSummary['total_listings'] ?? 0),
                'inquiries' => $currentInquiries,
                'favorites' => (int) ($favoriteRow['total'] ?? 0),
                'total_reviews' => $currentReviews,
                'average_rating' => round(
                    (float) ($reviewSummary['average_rating'] ?? 0),
                    2
                ),
                'pending_verifications' =>
                    (int) ($pendingVerification['pending_documents'] ?? 0),
                'landlord_response_rate' => $responseRate,
                'trends' => [
                    'new_users' => report_percentage(
                        $currentUsers,
                        $previousUsers
                    ),
                    'inquiries' => report_percentage(
                        $currentInquiries,
                        $previousInquiries
                    ),
                    'reviews' => report_percentage(
                        $currentReviews,
                        $previousReviews
                    )
                ]
            ],
            'listing_summary' => [
                'total' => (int) ($listingSummary['total_listings'] ?? 0),
                'available' =>
                    (int) ($listingSummary['available_listings'] ?? 0),
                'occupied' =>
                    (int) ($listingSummary['occupied_listings'] ?? 0),
                'without_images' =>
                    (int) ($listingSummary['listings_without_images'] ?? 0),
                'stale' =>
                    (int) ($listingSummary['stale_listings'] ?? 0),
                'average_price' => round(
                    (float) ($listingSummary['average_price'] ?? 0),
                    2
                )
            ],
            'demand_by_barangay' => $demandRows,
            'top_listings' => $topListings,
            'inquiries' => [
                'total' => $totalInquiries,
                'pending' =>
                    (int) ($inquiryMetrics['pending_inquiries'] ?? 0),
                'closed' =>
                    (int) ($inquiryMetrics['closed_inquiries'] ?? 0),
                'responded' => $respondedInquiries,
                'response_rate' => $responseRate,
                'average_response_hours' => round(
                    ((float) ($inquiryMetrics['average_response_minutes'] ?? 0)) / 60,
                    1
                ),
                'unanswered_over_48_hours' =>
                    (int) ($inquiryMetrics['unanswered_over_48_hours'] ?? 0)
            ],
            'landlords' => $landlords,
            'verification' => [
                'pending' =>
                    (int) ($pendingVerification['pending_documents'] ?? 0),
                'pending_over_48_hours' =>
                    (int) ($pendingVerification['pending_over_48_hours'] ?? 0),
                'submitted' =>
                    (int) ($verificationPeriod['submitted_documents'] ?? 0),
                'approved' =>
                    (int) ($verificationPeriod['approved_documents'] ?? 0),
                'rejected' =>
                    (int) ($verificationPeriod['rejected_documents'] ?? 0),
                'average_review_hours' => round(
                    ((float) ($verificationPeriod['average_review_minutes'] ?? 0)) / 60,
                    1
                ),
                'rejection_reasons' => $rejectionReasons
            ],
            'reviews' => [
                'total' => $currentReviews,
                'average_rating' => round(
                    (float) ($reviewSummary['average_rating'] ?? 0),
                    2
                ),
                'positive' =>
                    (int) ($reviewSummary['positive_reviews'] ?? 0),
                'neutral' =>
                    (int) ($reviewSummary['neutral_reviews'] ?? 0),
                'negative' =>
                    (int) ($reviewSummary['negative_reviews'] ?? 0),
                'platform' =>
                    (int) ($reviewSummary['platform_reviews'] ?? 0),
                'listing' =>
                    (int) ($reviewSummary['listing_reviews'] ?? 0),
                'distribution' => $distribution,
                'themes' => array_slice($reviewThemes, 0, 6),
                'negative_reviews' => $negativeReviews
            ],
            'users' => [
                'renters' => (int) ($roleCounts['renters'] ?? 0),
                'landlords' => (int) ($roleCounts['landlords'] ?? 0),
                'admins' => (int) ($roleCounts['admins'] ?? 0),
                'new_users' => $currentUsers
            ],
            'trend' => array_values($trendData)
        ]
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to generate admin reports.'
    ]);
}
