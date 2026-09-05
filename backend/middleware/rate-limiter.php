<?php

require_once __DIR__ . '/../config/env.php';

function security_identifier_hash(
    string $action,
    string $identifierType,
    string $identifier
): string {
    static $securityKey = null;

    if ($securityKey === null) {
        $securityKey = env_value('APP_SECURITY_KEY');

        if (
            $securityKey === null
            || strlen($securityKey) < 32
        ) {
            throw new RuntimeException(
                'APP_SECURITY_KEY is missing or too short.'
            );
        }
    }

    return hash_hmac(
        'sha256',
        $action . '|' . $identifierType . '|' . $identifier,
        $securityKey
    );
}

function security_client_ip(): string
{
    $ipAddress = trim(
        (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown')
    );

    if ($ipAddress === '') {
        return 'unknown';
    }

    if (
        $ipAddress !== 'unknown'
        && filter_var($ipAddress, FILTER_VALIDATE_IP) === false
    ) {
        return 'invalid';
    }

    return strtolower($ipAddress);
}

function auth_rate_limit_policies(
    string $action,
    string $email
): array {
    $normalizedEmail = strtolower(trim($email));
    $ipAddress = security_client_ip();

    if ($action === 'login') {
        return [
            [
                'identifier_type' => 'email_ip',
                'identifier' => $normalizedEmail . '|' . $ipAddress,
                'maximum_attempts' => 5,
                'window_seconds' => 900
            ],
            [
                'identifier_type' => 'email',
                'identifier' => $normalizedEmail,
                'maximum_attempts' => 12,
                'window_seconds' => 1800
            ],
            [
                'identifier_type' => 'ip',
                'identifier' => $ipAddress,
                'maximum_attempts' => 30,
                'window_seconds' => 900
            ]
        ];
    }

    if (
        in_array(
            $action,
            ['registration_otp', 'password_reset_otp'],
            true
        )
    ) {
        return [
            [
                'identifier_type' => 'email_ip',
                'identifier' => $normalizedEmail . '|' . $ipAddress,
                'maximum_attempts' => 5,
                'window_seconds' => 900
            ],
            [
                'identifier_type' => 'email',
                'identifier' => $normalizedEmail,
                'maximum_attempts' => 8,
                'window_seconds' => 3600
            ],
            [
                'identifier_type' => 'ip',
                'identifier' => $ipAddress,
                'maximum_attempts' => 30,
                'window_seconds' => 3600
            ]
        ];
    }

    throw new InvalidArgumentException(
        'Unsupported rate-limit action.'
    );
}

function auth_rate_limit_penalty_seconds(
    int $violationLevel
): int {
    return match (true) {
        $violationLevel <= 1 => 900,
        $violationLevel === 2 => 3600,
        default => 86400
    };
}

function auth_rate_limit_cleanup(PDO $pdo): void
{
    if (random_int(1, 100) !== 1) {
        return;
    }

    $pdo->exec('
        DELETE FROM auth_rate_limits
        WHERE updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    ');
}

function auth_rate_limit_check(
    PDO $pdo,
    string $action,
    string $email
): array {
    auth_rate_limit_cleanup($pdo);

    $policies = auth_rate_limit_policies($action, $email);
    $blocked = false;
    $retryAfter = 0;

    $getState = $pdo->prepare('
        SELECT
            GREATEST(
                0,
                TIMESTAMPDIFF(
                    SECOND,
                    NOW(),
                    blocked_until
                )
            ) AS retry_after
        FROM auth_rate_limits
        WHERE action = :action
            AND identifier_type = :identifier_type
            AND identifier_hash = :identifier_hash
        LIMIT 1
    ');

    foreach ($policies as $policy) {
        $identifierHash = security_identifier_hash(
            $action,
            $policy['identifier_type'],
            $policy['identifier']
        );

        $getState->execute([
            'action' => $action,
            'identifier_type' => $policy['identifier_type'],
            'identifier_hash' => $identifierHash
        ]);

        $state = $getState->fetch();

        if (!$state) {
            continue;
        }

        $currentRetryAfter = max(
            0,
            (int) ($state['retry_after'] ?? 0)
        );

        if ($currentRetryAfter > 0) {
            $blocked = true;
            $retryAfter = max($retryAfter, $currentRetryAfter);
        }
    }

    return [
        'blocked' => $blocked,
        'retry_after' => $retryAfter
    ];
}

function auth_rate_limit_record_failure(
    PDO $pdo,
    string $action,
    string $email
): array {
    $policies = auth_rate_limit_policies($action, $email);
    $ownsTransaction = !$pdo->inTransaction();
    $blocked = false;
    $retryAfter = 0;

    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $getState = $pdo->prepare('
            SELECT
                id,
                attempt_count,
                violation_level,
                blocked_until,
                TIMESTAMPDIFF(
                    SECOND,
                    window_started_at,
                    NOW()
                ) AS window_elapsed,
                TIMESTAMPDIFF(
                    SECOND,
                    last_attempt_at,
                    NOW()
                ) AS seconds_since_last_attempt,
                GREATEST(
                    0,
                    TIMESTAMPDIFF(
                        SECOND,
                        NOW(),
                        blocked_until
                    )
                ) AS retry_after
            FROM auth_rate_limits
            WHERE action = :action
                AND identifier_type = :identifier_type
                AND identifier_hash = :identifier_hash
            LIMIT 1
            FOR UPDATE
        ');

        $insertState = $pdo->prepare('
            INSERT INTO auth_rate_limits (
                action,
                identifier_type,
                identifier_hash,
                attempt_count,
                violation_level,
                window_started_at,
                last_attempt_at,
                blocked_until,
                created_at,
                updated_at
            )
            VALUES (
                :action,
                :identifier_type,
                :identifier_hash,
                1,
                0,
                NOW(),
                NOW(),
                NULL,
                NOW(),
                NOW()
            )
        ');

        $resetState = $pdo->prepare('
            UPDATE auth_rate_limits
            SET
                attempt_count = 1,
                violation_level = :violation_level,
                window_started_at = NOW(),
                last_attempt_at = NOW(),
                blocked_until = NULL,
                updated_at = NOW()
            WHERE id = :id
        ');

        $incrementState = $pdo->prepare('
            UPDATE auth_rate_limits
            SET
                attempt_count = :attempt_count,
                last_attempt_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ');

        $blockState = $pdo->prepare('
            UPDATE auth_rate_limits
            SET
                attempt_count = :attempt_count,
                violation_level = :violation_level,
                last_attempt_at = NOW(),
                blocked_until = FROM_UNIXTIME(
                    UNIX_TIMESTAMP(NOW()) + :penalty_seconds
                ),
                updated_at = NOW()
            WHERE id = :id
        ');

        foreach ($policies as $policy) {
            $identifierHash = security_identifier_hash(
                $action,
                $policy['identifier_type'],
                $policy['identifier']
            );

            $parameters = [
                'action' => $action,
                'identifier_type' => $policy['identifier_type'],
                'identifier_hash' => $identifierHash
            ];

            $getState->execute($parameters);
            $state = $getState->fetch();

            if (!$state) {
                $insertState->execute($parameters);
                continue;
            }

            $currentRetryAfter = max(
                0,
                (int) ($state['retry_after'] ?? 0)
            );

            if ($currentRetryAfter > 0) {
                $blocked = true;
                $retryAfter = max(
                    $retryAfter,
                    $currentRetryAfter
                );
                continue;
            }

            $violationLevel = (int) $state['violation_level'];
            $secondsSinceLastAttempt = (int) (
                $state['seconds_since_last_attempt'] ?? 0
            );

            if ($secondsSinceLastAttempt >= 604800) {
                $violationLevel = 0;
            }

            $windowExpired =
                (int) $state['window_elapsed']
                >= (int) $policy['window_seconds'];

            $previousBlockExpired =
                $state['blocked_until'] !== null;

            if ($windowExpired || $previousBlockExpired) {
                $resetState->execute([
                    'violation_level' => $violationLevel,
                    'id' => $state['id']
                ]);
                continue;
            }

            $attemptCount =
                (int) $state['attempt_count'] + 1;

            if (
                $attemptCount
                < (int) $policy['maximum_attempts']
            ) {
                $incrementState->execute([
                    'attempt_count' => $attemptCount,
                    'id' => $state['id']
                ]);
                continue;
            }

            $newViolationLevel = min(
                3,
                $violationLevel + 1
            );

            $penaltySeconds =
                auth_rate_limit_penalty_seconds(
                    $newViolationLevel
                );

            $blockState->execute([
                'attempt_count' => $attemptCount,
                'violation_level' => $newViolationLevel,
                'penalty_seconds' => $penaltySeconds,
                'id' => $state['id']
            ]);

            $blocked = true;
            $retryAfter = max($retryAfter, $penaltySeconds);
        }

        if ($ownsTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $exception) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $exception;
    }

    return [
        'blocked' => $blocked,
        'retry_after' => $retryAfter
    ];
}

function auth_rate_limit_clear_success(
    PDO $pdo,
    string $action,
    string $email
): void {
    $normalizedEmail = strtolower(trim($email));
    $ipAddress = security_client_ip();

    $emailHash = security_identifier_hash(
        $action,
        'email',
        $normalizedEmail
    );

    $emailIpHash = security_identifier_hash(
        $action,
        'email_ip',
        $normalizedEmail . '|' . $ipAddress
    );

    $clearState = $pdo->prepare('
        DELETE FROM auth_rate_limits
        WHERE action = :action
            AND (
                (
                    identifier_type = :email_type
                    AND identifier_hash = :email_hash
                )
                OR
                (
                    identifier_type = :email_ip_type
                    AND identifier_hash = :email_ip_hash
                )
            )
    ');

    $clearState->execute([
        'action' => $action,
        'email_type' => 'email',
        'email_hash' => $emailHash,
        'email_ip_type' => 'email_ip',
        'email_ip_hash' => $emailIpHash
    ]);
}
