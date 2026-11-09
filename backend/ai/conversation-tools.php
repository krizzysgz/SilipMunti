<?php

function smAiRows(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function smAiText(mixed $value, int $max = 200): string
{
    if (!is_string($value) || mb_strlen($value) > $max) {
        throw new InvalidArgumentException('Invalid text argument.');
    }
    return trim($value);
}

function smAiInteger(mixed $value, int $min, int $max): int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);
    if ($number === false || $number < $min || $number > $max) {
        throw new InvalidArgumentException('Invalid numeric argument.');
    }
    return $number;
}

function smAiLike(string $value): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value) . '%';
}

function smAiAmenities(mixed $value): array
{
    $decoded = is_array($value) ? $value : json_decode((string) $value, true);
    $items = is_array($decoded) ? $decoded : (preg_split('/\s*[,;|]\s*/', (string) $value) ?: []);
    return array_values(array_slice(array_filter($items, 'is_string'), 0, 20));
}

function smAiListingScope(bool $available = true): string
{
    return "l.deleted_at IS NULL AND u.deleted_at IS NULL
        AND u.role = 'landlord' AND u.landlord_status = 'approved'
        AND rt.deleted_at IS NULL AND l.verification_status = 'verified'"
        . ($available ? " AND l.availability_status = 'available'" : '');
}

function smAiPublicTool(PDO $pdo, string $name, array $args): array
{
    try {
        $limit = isset($args['limit']) ? smAiInteger($args['limit'], 1, 10) : 5;
        if ($name === 'find_landlords') {
            $search = smAiText($args['name'] ?? '');
            if (mb_strlen($search) < 2) {
                return ['error' => 'Ask the renter for at least two characters of the landlord name.'];
            }
            $base = "SELECT id, CONCAT(first_name, ' ', last_name) AS name
                FROM users WHERE role = 'landlord' AND landlord_status = 'approved'
                AND deleted_at IS NULL";
            $rows = smAiRows($pdo, $base . " AND CONCAT(first_name, ' ', last_name) = :name ORDER BY id LIMIT 6", ['name' => $search]);
            if (!$rows) {
                $rows = smAiRows($pdo, $base . " AND CONCAT(first_name, ' ', last_name) LIKE :name ESCAPE '!' ORDER BY first_name, last_name, id LIMIT 6", ['name' => smAiLike($search)]);
            }
            return ['landlords' => $rows, 'needs_clarification' => count($rows) > 1];
        }

        if (in_array($name, ['get_available_listings', 'get_listing_details'], true)) {
            $detail = $name === 'get_listing_details';
            $where = smAiListingScope(!$detail);
            $params = [];
            if ($detail) {
                $params['listing_id'] = smAiInteger($args['listing_id'] ?? null, 1, PHP_INT_MAX);
                $where .= ' AND l.id = :listing_id';
                $limit = 1;
            } else {
                foreach (['landlord_id', 'rental_type_id'] as $key) {
                    if (isset($args[$key])) {
                        $params[$key] = smAiInteger($args[$key], 1, PHP_INT_MAX);
                        $where .= " AND l.{$key} = :{$key}";
                    }
                }
                if (!empty($args['barangay'])) {
                    $params['barangay'] = smAiText($args['barangay'], 100);
                    $where .= ' AND l.barangay = :barangay';
                }
                if (isset($args['max_price'])) {
                    if (!is_numeric($args['max_price']) || !is_finite((float) $args['max_price']) || (float) $args['max_price'] < 0 || (float) $args['max_price'] > 1000000) {
                        throw new InvalidArgumentException('Invalid maximum price.');
                    }
                    $params['max_price'] = (float) $args['max_price'];
                    $where .= ' AND l.price <= :max_price';
                }
                foreach (['bedroom_no' => [0, 20], 'occupancy' => [1, 100]] as $key => [$min, $max]) {
                    if (isset($args[$key])) {
                        $params[$key] = smAiInteger($args[$key], $min, $max);
                        $column = $key === 'occupancy' ? 'occupancy_limit' : 'bedroom_no';
                        $where .= " AND l.{$column} >= :{$key}";
                    }
                }
                if (!empty($args['query'])) {
                    $query = smAiLike(smAiText($args['query']));
                    $params['title_query'] = $query;
                    $params['description_query'] = $query;
                    $where .= " AND (l.title LIKE :title_query ESCAPE '!' OR l.description LIKE :description_query ESCAPE '!')";
                }
                if (isset($args['amenities'])) {
                    if (!is_array($args['amenities']) || count($args['amenities']) > 10) {
                        throw new InvalidArgumentException('Invalid amenities.');
                    }
                    foreach (array_values($args['amenities']) as $index => $value) {
                        $amenity = mb_strtolower(smAiText($value, 100));
                        if ($amenity === '') continue;
                        $params['json_amenity_' . $index] = json_encode($amenity, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                        $params['text_amenity_' . $index] = $amenity;
                        $where .= " AND (
                            JSON_CONTAINS(IF(JSON_VALID(l.amenities), LOWER(l.amenities), '[]'), :json_amenity_{$index}) = 1
                            OR (NOT JSON_VALID(COALESCE(l.amenities, '')) AND FIND_IN_SET(:text_amenity_{$index}, LOWER(REPLACE(REPLACE(REPLACE(COALESCE(l.amenities, ''), ';', ','), '|', ','), ', ', ','))) > 0)
                        )";
                    }
                }
            }
            $rows = smAiRows($pdo, "SELECT l.id, l.title, l.price, l.barangay, l.city, l.address,
                (SELECT li.image_path FROM listing_images li
                 WHERE li.listing_id = l.id AND li.deleted_at IS NULL
                 ORDER BY li.id ASC LIMIT 1) AS primary_image_path,
                l.description, l.availability_status, l.bedroom_no, l.occupancy_limit,
                l.listing_size, l.amenities, l.nearby_establishments, l.transport_routes,
                u.id AS landlord_id, CONCAT(u.first_name, ' ', u.last_name) AS landlord_name,
                rt.name AS rental_type FROM listings l
                INNER JOIN users u ON u.id = l.landlord_id
                INNER JOIN rental_types rt ON rt.id = l.rental_type_id
                WHERE {$where} ORDER BY l.created_at DESC, l.id DESC LIMIT {$limit}", $params);
            foreach ($rows as &$row) {
                $row['description'] = mb_substr((string) $row['description'], 0, 600);
                $row['amenities'] = smAiAmenities($row['amenities']);
                $row['id'] = (int) $row['id'];
                $row['price'] = (float) $row['price'];
                $row['bedroom_no'] = $row['bedroom_no'] !== null ? (int) $row['bedroom_no'] : null;
                $row['occupancy_limit'] = $row['occupancy_limit'] !== null ? (int) $row['occupancy_limit'] : null;
                $path = trim((string) $row['primary_image_path']);
                if ($path !== '' && !str_starts_with($path, '/') && !preg_match('~^https?://~i', $path)) {
                    $path = '/SilipMunti/backend/' . ltrim($path, '/');
                }
                // Only same-site paths and HTTP(S) images; never executable URL schemes.
                $row['primary_image'] = ($path !== '' && (str_starts_with($path, '/') || preg_match('~^https?://~i', $path))) ? $path : null;
                unset($row['primary_image_path']);
            }
            unset($row);
            return ['listings' => $rows, 'result_limit' => $limit];
        }

        if ($name === 'get_listing_stats') {
            $where = smAiListingScope();
            $params = [];
            if (!empty($args['barangay'])) {
                $where .= ' AND l.barangay = :barangay';
                $params['barangay'] = smAiText($args['barangay'], 100);
            }
            if (isset($args['landlord_id'])) {
                $where .= ' AND l.landlord_id = :landlord_id';
                $params['landlord_id'] = smAiInteger($args['landlord_id'], 1, PHP_INT_MAX);
            }
            return ['statistics' => smAiRows($pdo, "SELECT l.barangay,
                COUNT(*) AS total_available, ROUND(AVG(l.price), 2) AS average_price,
                MIN(l.price) AS minimum_price, MAX(l.price) AS maximum_price
                FROM listings l INNER JOIN users u ON u.id = l.landlord_id
                INNER JOIN rental_types rt ON rt.id = l.rental_type_id
                WHERE {$where} GROUP BY l.barangay ORDER BY total_available DESC", $params)];
        }

        if ($name === 'get_top_landlords') {
            $where = smAiListingScope(false) . " AND r.status = 'published' AND r.review_type = 'listing' AND r.deleted_at IS NULL";
            $params = [];
            if (!empty($args['barangay'])) {
                $where .= ' AND l.barangay = :barangay';
                $params['barangay'] = smAiText($args['barangay'], 100);
            }
            return ['landlords' => smAiRows($pdo, "SELECT u.id,
                CONCAT(u.first_name, ' ', u.last_name) AS name,
                ROUND(AVG(r.rating), 2) AS average_rating, COUNT(r.id) AS review_count
                FROM users u INNER JOIN listings l ON l.landlord_id = u.id
                INNER JOIN rental_types rt ON rt.id = l.rental_type_id
                INNER JOIN reviews r ON r.listing_id = l.id
                WHERE {$where} GROUP BY u.id, u.first_name, u.last_name
                ORDER BY average_rating DESC, review_count DESC, u.id LIMIT {$limit}", $params),
                'rating_basis' => 'Published listing reviews on active verified listings'];
        }
        return ['error' => 'Unsupported tool. Ask a clarifying question.'];
    } catch (InvalidArgumentException $exception) {
        return ['error' => $exception->getMessage()];
    } catch (Throwable $exception) {
        error_log('Public AI tool failed: ' . $name);
        return ['error' => 'Database information is temporarily unavailable. Do not treat this as zero results.'];
    }
}
