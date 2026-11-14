<?php

function normalize_registration_phone(string $raw): ?string
{
    $phone = preg_replace('/[\s().-]+/', '', trim($raw));

    if (preg_match('/^09\d{9}$/', $phone)) {
        return $phone;
    }

    if (preg_match('/^(?:\+63|63)9\d{9}$/', $phone)) {
        return '0' . substr($phone, -10);
    }

    return null;
}

function registration_phone_exists(PDO $pdo, string $phone): bool
{
    $local = normalize_registration_phone($phone);

    if ($local === null) {
        return false;
    }

    $international = '63' . substr($local, 1);
    $phoneDigits = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')";
    $query = $pdo->prepare("SELECT id FROM users
        WHERE {$phoneDigits} IN (:local_phone, :international_phone, :plus_phone)
        LIMIT 1");
    $query->execute([
        'local_phone' => $local,
        'international_phone' => $international,
        'plus_phone' => '+' . $international,
    ]);

    return (bool) $query->fetchColumn();
}

function validate_registration_data(array $data): array
{
    $values = [
        'first_name' => trim((string) ($data['first_name'] ?? '')),
        'last_name' => trim((string) ($data['last_name'] ?? '')),
        'email' => strtolower(trim((string) ($data['email'] ?? ''))),
        'phone_number' => trim((string) ($data['phone_number'] ?? '')),
        'password' => (string) ($data['password'] ?? ''),
        'confirm_password' => (string) ($data['confirm_password'] ?? ''),
        'role' => trim((string) ($data['role'] ?? '')),
    ];

    $errors = [];

    if ($values['first_name'] === '') {
        $errors['first_name'] = 'First name is required.';
    } elseif (mb_strlen($values['first_name']) > 100) {
        $errors['first_name'] = 'First name must not exceed 100 characters.';
    }

    if ($values['last_name'] === '') {
        $errors['last_name'] = 'Last name is required.';
    } elseif (mb_strlen($values['last_name']) > 100) {
        $errors['last_name'] = 'Last name must not exceed 100 characters.';
    }

    if ($values['email'] === '') {
        $errors['email'] = 'Email is required.';
    } elseif (strlen($values['email']) > 254) {
        $errors['email'] = 'Email address is too long.';
    } elseif (!filter_var($values['email'], FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Email address is invalid.';
    }

    if ($values['phone_number'] !== '') {
        $normalizedPhone = normalize_registration_phone($values['phone_number']);

        if ($normalizedPhone === null) {
            $errors['phone_number'] = 'Enter a valid Philippine mobile number (09XXXXXXXXX).';
        } else {
            $values['phone_number'] = $normalizedPhone;
        }
    }

    if ($values['password'] === '') {
        $errors['password'] = 'Password is required.';
    } elseif (strlen($values['password']) < 8) {
        $errors['password'] = 'Password must contain at least 8 characters.';
    } elseif (strlen($values['password']) > 255) {
        $errors['password'] = 'Password is too long.';
    } elseif (!preg_match('/[A-Z]/', $values['password']) ||
        !preg_match('/[a-z]/', $values['password']) ||
        !preg_match('/[0-9]/', $values['password']) ||
        !preg_match('/[\W_]/', $values['password'])) {
        $errors['password'] = 'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.';
    }

    if ($values['confirm_password'] === '') {
        $errors['confirm_password'] = 'Password confirmation is required.';
    } elseif ($values['password'] !== $values['confirm_password']) {
        $errors['confirm_password'] = 'Passwords do not match.';
    }

    if (!in_array($values['role'], ['renter', 'landlord'], true)) {
        $errors['role'] = 'Role must be renter or landlord.';
    }

    return ['values' => $values, 'errors' => $errors];
}
