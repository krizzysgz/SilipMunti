<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../config/mailer.php';

function email_change_reply(
    int $status,
    bool $success,
    string $message,
    array $data = []
): never {
    http_response_code($status);

    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

function email_change_mail(
    string $recipient,
    string $subject,
    string $body
): void {
    $mail = create_smtp_mailer();

    $mail->addAddress($recipient);
    $mail->isHTML(false);
    $mail->Subject = $subject;
    $mail->Body = $body;

    $mail->send();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    email_change_reply(405, false, 'Method not allowed.');
}

$user = require_login($pdo);

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    email_change_reply(400, false, 'Invalid JSON data.');
}

$action = is_string($data['action'] ?? null)
    ? $data['action']
    : '';

if (!in_array($action, ['request', 'confirm'], true)) {
    email_change_reply(422, false, 'Invalid email-change action.');
}

try {
    $pdo->beginTransaction();

    // Serialize email-change operations across this user's sessions.
    $stmt = $pdo->prepare('
        SELECT id, email, password, session_version
        FROM users
        WHERE id = ?
            AND deleted_at IS NULL
        FOR UPDATE
    ');

    $stmt->execute([$user['id']]);
    $account = $stmt->fetch();

    if (
        !$account
        || (int) $account['session_version']
            !== ($_SESSION['session_version'] ?? null)
    ) {
        $pdo->rollBack();
        clear_user_session();

        email_change_reply(401, false, 'Please sign in again.');
    }

    $stmt = $pdo->prepare('
        INSERT INTO email_change_requests (user_id)
        VALUES (?)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
    ');

    $stmt->execute([$user['id']]);

    $stmt = $pdo->prepare('
        SELECT
            *,
            UNIX_TIMESTAMP(NOW()) AS current_time,
            UNIX_TIMESTAMP(window_started_at) AS window_start,
            UNIX_TIMESTAMP(last_requested_at) AS last_request,
            UNIX_TIMESTAMP(expires_at) AS expiry
        FROM email_change_requests
        WHERE user_id = ?
        FOR UPDATE
    ');

    $stmt->execute([$user['id']]);
    $pending = $stmt->fetch();

    if (!$pending) {
        throw new RuntimeException('Email-change state is unavailable.');
    }

    if ($action === 'request') {
        $newEmail = is_string($data['new_email'] ?? null)
            ? strtolower(trim($data['new_email']))
            : '';

        $password = is_string($data['current_password'] ?? null)
            ? $data['current_password']
            : '';

        if (
            strlen($newEmail) > 150
            || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)
            || $password === ''
            || strlen($password) > 255
        ) {
            $pdo->rollBack();

            email_change_reply(
                422,
                false,
                'Enter a valid email (maximum 150 characters) and your current password.'
            );
        }

        $now = (int) $pending['current_time'];
        $resetWindow = $now - (int) $pending['window_start'] >= 3600;
        $count = $resetWindow ? 0 : (int) $pending['request_count'];

        $tooSoon =
            $pending['last_request'] !== null
            && $now - (int) $pending['last_request'] < 60;

        if ($count >= 5 || $tooSoon) {
            $retry = $count >= 5
                ? max(1, 3600 - ($now - (int) $pending['window_start']))
                : max(1, 60 - ($now - (int) $pending['last_request']));

            $pdo->rollBack();
            header('Retry-After: ' . $retry);

            email_change_reply(
                429,
                false,
                'Too many requests. Try again in ' . $retry . ' seconds.'
            );
        }

        // Count incorrect passwords and unsuccessful requests too.
        $stmt = $pdo->prepare('
            UPDATE email_change_requests
            SET
                request_count = ?,
                window_started_at =
                    IF(? = 1, NOW(), window_started_at),
                last_requested_at = NOW()
            WHERE user_id = ?
        ');

        $stmt->execute([
            $count + 1,
            $resetWindow ? 1 : 0,
            $user['id']
        ]);

        if (!password_verify($password, $account['password'])) {
            $pdo->commit();

            email_change_reply(
                422,
                false,
                'Current password is incorrect.'
            );
        }

        if (strcasecmp($newEmail, $account['email']) === 0) {
            $pdo->commit();

            email_change_reply(
                422,
                false,
                'Choose an email different from your current email.'
            );
        }

        $stmt = $pdo->prepare('
            SELECT id
            FROM users
            WHERE email = ?
            LIMIT 1
        ');

        $stmt->execute([$newEmail]);

        if ($stmt->fetch()) {
            $pdo->commit();

            email_change_reply(
                409,
                false,
                'That email address is unavailable.'
            );
        }

        $otp = (string) random_int(100000, 999999);
        $challenge = bin2hex(random_bytes(32));
        $otpHash = password_hash($otp, PASSWORD_DEFAULT);

        if ($otpHash === false) {
            throw new RuntimeException(
                'Unable to secure verification code.'
            );
        }

        $stmt = $pdo->prepare('
            UPDATE email_change_requests
            SET
                old_email = ?,
                new_email = ?,
                otp_hash = ?,
                challenge_hash = ?,
                session_version = ?,
                attempts = 0,
                expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
            WHERE user_id = ?
        ');

        $stmt->execute([
            $account['email'],
            $newEmail,
            $otpHash,
            hash('sha256', $challenge),
            (int) $account['session_version'],
            $user['id']
        ]);

        $pdo->commit();

        // Bind confirmation to the session that verified the password.
        $_SESSION['email_change_challenge'] = $challenge;

        try {
            email_change_mail(
                $newEmail,
                'Verify your new SilipMunti email',
                "Your SilipMunti email-change code is: {$otp}\n\n"
                . "It expires in 10 minutes. Do not share this code.\n\n"
                . "If you did not request this change, ignore this email."
            );
        } catch (Throwable $mailError) {
            error_log('Email-change OTP delivery failed.');

            $stmt = $pdo->prepare('
                UPDATE email_change_requests
                SET
                    otp_hash = NULL,
                    challenge_hash = NULL,
                    expires_at = NULL
                WHERE user_id = ?
                    AND challenge_hash = ?
            ');

            $stmt->execute([
                $user['id'],
                hash('sha256', $challenge)
            ]);

            unset($_SESSION['email_change_challenge']);

            email_change_reply(
                503,
                false,
                'Unable to send the code. Your account email has not changed. Try again after 60 seconds.'
            );
        }

        email_change_reply(
            200,
            true,
            'Verification code sent. Your current email stays active until verification.',
            ['new_email' => $newEmail]
        );
    }

    $otp = is_string($data['otp'] ?? null)
        ? trim($data['otp'])
        : '';

    $challenge = $_SESSION['email_change_challenge'] ?? null;

    $validRequest =
        is_string($challenge)
        && is_string($pending['challenge_hash'])
        && hash_equals(
            $pending['challenge_hash'],
            hash('sha256', $challenge)
        )
        && is_string($pending['otp_hash'])
        && (int) $pending['session_version']
            === (int) $account['session_version']
        && $pending['old_email'] === $account['email']
        && (int) $pending['expiry'] > (int) $pending['current_time'];

    if (!$validRequest || (int) $pending['attempts'] >= 5) {
        $pdo->rollBack();

        email_change_reply(
            422,
            false,
            'Verification expired or unavailable. Start again to request a new code.'
        );
    }

    if (
        !preg_match('/^\d{6}$/', $otp)
        || !password_verify($otp, $pending['otp_hash'])
    ) {
        $attempts = (int) $pending['attempts'] + 1;

        $stmt = $pdo->prepare('
            UPDATE email_change_requests
            SET attempts = ?
            WHERE user_id = ?
        ');

        $stmt->execute([$attempts, $user['id']]);
        $pdo->commit();

        email_change_reply(
            $attempts >= 5 ? 429 : 422,
            false,
            $attempts >= 5
                ? 'Too many incorrect codes. Start again to request a new code.'
                : 'Incorrect code. ' . (5 - $attempts) . ' attempts remaining.'
        );
    }

    // Recheck availability; another account may have claimed it.
    $stmt = $pdo->prepare('
        SELECT id
        FROM users
        WHERE email = ?
            AND id <> ?
        LIMIT 1
    ');

    $stmt->execute([
        $pending['new_email'],
        $user['id']
    ]);

    if ($stmt->fetch()) {
        $pdo->rollBack();

        email_change_reply(
            409,
            false,
            'That email address is no longer available. Start again.'
        );
    }

    $oldEmail = $account['email'];
    $newEmail = $pending['new_email'];
    $newVersion = (int) $account['session_version'] + 1;

    $stmt = $pdo->prepare('
        UPDATE users
        SET
            email = ?,
            session_version = session_version + 1
        WHERE id = ?
            AND deleted_at IS NULL
    ');

    $stmt->execute([$newEmail, $user['id']]);

    // Invalidate recovery tokens issued before the email change.
    $stmt = $pdo->prepare('
        DELETE FROM password_reset_otps
        WHERE email IN (?, ?)
    ');

    $stmt->execute([$oldEmail, $newEmail]);

    // Keep rate-limit counters, but consume the verification challenge.
    $stmt = $pdo->prepare('
        UPDATE email_change_requests
        SET
            old_email = NULL,
            new_email = NULL,
            otp_hash = NULL,
            challenge_hash = NULL,
            expires_at = NULL,
            attempts = 0
        WHERE user_id = ?
    ');

    $stmt->execute([$user['id']]);
    $pdo->commit();

    $_SESSION['session_version'] = $newVersion;
    unset($_SESSION['email_change_challenge']);

    session_regenerate_id(true);
    $_SESSION['last_regeneration'] = time();

    csrf_rotate_token();

    $noticeSent = true;

    try {
        email_change_mail(
            $oldEmail,
            'Your SilipMunti email address changed',
            "Your SilipMunti account email was changed to {$newEmail}.\n\n"
            . "Other signed-in sessions were revoked.\n\n"
            . "If you did not authorize this change, contact the "
            . "SilipMunti administrator immediately."
        );
    } catch (Throwable $mailError) {
        $noticeSent = false;
        error_log('Email-change security notification delivery failed.');
    }

    email_change_reply(
        200,
        true,
        $noticeSent
            ? 'Email verified and updated successfully.'
            : 'Email updated successfully, but the notification to your old email could not be delivered.',
        ['new_email' => $newEmail]
    );
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log(
        'Email-change operation failed: ' . $exception->getMessage()
    );

    $conflict =
        $exception instanceof PDOException
        && (string) $exception->getCode() === '23000';

    email_change_reply(
        $conflict ? 409 : 500,
        false,
        $conflict
            ? 'That email address is unavailable. Start again.'
            : 'Unable to process the email change. Please refresh your profile before trying again.'
    );
}