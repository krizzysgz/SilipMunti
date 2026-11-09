<?php

function aiLandlordListingsAnswer(
    PDO $pdo,
    string $message
): ?string {
    $pattern = '/\b(?:listings?|properties|rentals?|units?|apartments?|bahay|paupa)\s+(?:ni|nina|ng|of|by|from|owned\s+by)\s+(?:landlord\s+)?(?<name>[\p{L}\p{M}][\p{L}\p{M}\s.\x{2019}\x{2018}\x{0027}-]{0,199})[?!.]*$/iu';

    if (preg_match($pattern, trim($message), $matches) !== 1) {
        // Let the existing assistant handle other questions.
        return null;
    }

    $name = trim(
        preg_replace('/\s+/u', ' ', $matches['name']),
        " \t\n\r\0\x0B.?!"
    );

    if (mb_strlen($name) < 2) {
        return 'Pakibigay ang buong pangalan ng landlord na hinahanap mo.';
    }

    // Prefer an exact full-name match.
    $stmt = $pdo->prepare("
        SELECT
            id,
            CONCAT(first_name, ' ', last_name) AS name
        FROM users
        WHERE role = 'landlord'
          AND landlord_status = 'approved'
          AND deleted_at IS NULL
          AND CONCAT(first_name, ' ', last_name) = :name
        ORDER BY id ASC
        LIMIT 6
    ");

    $stmt->execute(['name' => $name]);
    $landlords = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Otherwise try a partial name, without treating input as wildcards.
    if (!$landlords) {
        $escapedName = str_replace(
            ['!', '%', '_'],
            ['!!', '!%', '!_'],
            $name
        );

        $stmt = $pdo->prepare("
            SELECT
                id,
                CONCAT(first_name, ' ', last_name) AS name
            FROM users
            WHERE role = 'landlord'
              AND landlord_status = 'approved'
              AND deleted_at IS NULL
              AND CONCAT(first_name, ' ', last_name)
                  LIKE :name ESCAPE '!'
            ORDER BY first_name ASC, last_name ASC, id ASC
            LIMIT 6
        ");

        $stmt->execute([
            'name' => '%' . $escapedName . '%'
        ]);

        $landlords = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    if (!$landlords) {
        return 'Wala akong nakitang approved landlord na tumutugma sa "'
            . $name
            . '". Pakitingnan ang pangalan sa Landlords page.';
    }

    // Do not guess which landlord the renter means.
    if (count($landlords) > 1) {
        $names = array_values(array_unique(
            array_column($landlords, 'name')
        ));

        if (count($names) > 1) {
            return 'May higit sa isang approved landlord na tumutugma: '
                . implode(', ', array_slice($names, 0, 5))
                . '. Pakibigay ang buong pangalan, halimbawa: '
                . 'Ano ang listings ni Pedro Santos?';
        }

        return 'May higit sa isang approved landlord na may pangalang '
            . $names[0]
            . '. Buksan ang tamang profile sa Landlords page '
            . 'para makita ang listings niya.';
    }

    $landlord = $landlords[0];

    $stmt = $pdo->prepare("
        SELECT
            l.id,
            l.title,
            l.price,
            l.barangay
        FROM listings l
        INNER JOIN users u
            ON u.id = l.landlord_id
        INNER JOIN rental_types rt
            ON rt.id = l.rental_type_id
        WHERE l.landlord_id = :landlord_id
          AND u.role = 'landlord'
          AND u.landlord_status = 'approved'
          AND u.deleted_at IS NULL
          AND l.deleted_at IS NULL
          AND rt.deleted_at IS NULL
          AND l.verification_status = 'verified'
          AND l.availability_status = 'available'
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 6
    ");

    $stmt->execute([
        'landlord_id' => (int) $landlord['id']
    ]);

    $listings = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$listings) {
        return 'Approved landlord si '
            . $landlord['name']
            . ', pero wala siyang verified at available listing sa ngayon.';
    }

    $items = [];

    foreach (array_slice($listings, 0, 5) as $index => $listing) {
        $items[] = ($index + 1)
            . ') '
            . $listing['title']
            . ' — ₱'
            . number_format((float) $listing['price'], 2)
            . '/month, '
            . $listing['barangay'];
    }

    $answer = 'Ito ang verified at available listings ni '
        . $landlord['name']
        . ': '
        . implode('; ', $items)
        . '.';

    if (count($listings) > 5) {
        $answer .=
            ' May iba pa; tingnan ang landlord profile para sa buong listahan.';
    }

    return $answer;
}