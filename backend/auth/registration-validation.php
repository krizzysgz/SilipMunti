<?php

function validate_registration_data(array $data): array
{
    $values = [
        'first_name' => trim($data['first_name'] ?? ''),
        'last_name' => trim($data['last_name'] ?? ''),
        'email' => strtolower(trim($data['email'] ?? '')),
        'phone_number' => trim($data['phone_number'] ?? ''),
        'password' => $data['password'] ?? '',
        'confirm_password' => $data['confirm_password'] ?? '',
        'role' => trim($data['role'] ?? '')
    ];

    $errors = [];

    if ($values['first_name'] === '') {
        $errors['first_name'] = 'First name is required.';
    } elseif (mb_strlen($values['first_name']) > 100) {
        $errors['first_name'] =
            'First name must not exceed 100 characters.';
    }

    if ($values['last_name'] === '') {
        $errors['last_name'] = 'Last name is required.';
    } elseif (mb_strlen($values['last_name']) > 100) {
        $errors['last_name'] =
            'Last name must not exceed 100 characters.';
    }

    if ($values['email'] === '') {
        $errors['email'] = 'Email is required.';
    } elseif (strlen($values['email']) > 254) {
        $errors['email'] = 'Email address is too long.';
    } elseif (
        !filter_var(
            $values['email'],
            FILTER_VALIDATE_EMAIL
        )
    ) {
        $errors['email'] = 'Email address is invalid.';
    }

    if (
        $values['phone_number'] !== '' &&
        mb_strlen($values['phone_number']) > 30
    ) {
        $errors['phone_number'] =
            'Phone number must not exceed 30 characters.';
    }

    if ($values['password'] === '') {
        $errors['password'] = 'Password is required.';
    } elseif (strlen($values['password']) < 8) {
        $errors['password'] =
            'Password must contain at least 8 characters.';
    } elseif (strlen($values['password']) > 255) {
        $errors['password'] = 'Password is too long.';
    }

    if ($values['confirm_password'] === '') {
        $errors['confirm_password'] =
            'Password confirmation is required.';
    } elseif (
        $values['password'] !==
        $values['confirm_password']
    ) {
        $errors['confirm_password'] =
            'Passwords do not match.';
    }

    if (
        !in_array(
            $values['role'],
            ['renter', 'landlord'],
            true
        )
    ) {
        $errors['role'] =
            'Role must be renter or landlord.';
    }

    return [
        'values' => $values,
        'errors' => $errors
    ];
}