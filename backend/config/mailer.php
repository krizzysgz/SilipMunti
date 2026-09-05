<?php

require_once __DIR__ . '/env.php';

function create_smtp_mailer()
{
    $autoloadPath = dirname(__DIR__) . '/vendor/autoload.php';

    if (!is_file($autoloadPath)) {
        throw new RuntimeException(
            'PHPMailer is not installed. Run composer install in the backend folder.'
        );
    }

    require_once $autoloadPath;

    $host = env_value('SMTP_HOST', 'smtp.gmail.com');

    $port = filter_var(
        env_value('SMTP_PORT', '587'),
        FILTER_VALIDATE_INT
    );

    $encryption = strtolower(
        env_value('SMTP_ENCRYPTION', 'tls')
    );

    $username = env_value('SMTP_USERNAME');
    $password = env_value('SMTP_PASSWORD');
    $fromEmail = env_value('SMTP_FROM_EMAIL', $username);
    $fromName = env_value('SMTP_FROM_NAME', 'SilipMunti');

    if (
        $host === null ||
        $port === false ||
        $port < 1 ||
        $username === null ||
        $username === '' ||
        $password === null ||
        $password === '' ||
        $fromEmail === null ||
        !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)
    ) {
        throw new RuntimeException(
            'SMTP configuration is incomplete.'
        );
    }

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);

    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = $port;
    $mail->SMTPAuth = true;
    $mail->Username = $username;
    $mail->Password = $password;
    $mail->Timeout = 15;
    $mail->CharSet = 'UTF-8';

    if (in_array($encryption, ['ssl', 'smtps'], true)) {
        $mail->SMTPSecure =
            PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    } elseif (
        in_array($encryption, ['tls', 'starttls'], true)
    ) {
        $mail->SMTPSecure =
            PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    } elseif (!in_array($encryption, ['', 'none'], true)) {
        throw new RuntimeException(
            'SMTP encryption setting is invalid.'
        );
    }

    $mail->setFrom($fromEmail, $fromName);

    return $mail;
}

function send_registration_otp_email(
    string $recipientEmail,
    string $recipientName,
    string $otp
): void {
    $mail = create_smtp_mailer();

    $safeName = htmlspecialchars(
        $recipientName !== '' ? $recipientName : 'there',
        ENT_QUOTES,
        'UTF-8'
    );

    $mail->addAddress($recipientEmail, $recipientName);
    $mail->isHTML(true);
    $mail->Subject = 'Your SilipMunti verification code';

    $mail->Body = '
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
            <h2 style="color:#1027b5">
                Verify your SilipMunti account
            </h2>

            <p>Hello ' . $safeName . ',</p>

            <p>
                Enter this verification code to complete
                your registration:
            </p>

            <div style="margin:24px 0;padding:18px;text-align:center;background:#f3f5ff;border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;color:#1027b5">
                ' . $otp . '
            </div>

            <p>
                This code expires in 10 minutes.
                Do not share it with anyone.
            </p>

            <p>
                If you did not request this code,
                you can ignore this email.
            </p>
        </div>
    ';

    $mail->AltBody =
        'Your SilipMunti verification code is ' .
        $otp .
        '. It expires in 10 minutes.';

    $mail->send();
}

function send_password_reset_otp_email(
    string $recipientEmail,
    string $recipientName,
    string $otp
): void {
    $mail = create_smtp_mailer();

    $safeName = htmlspecialchars(
        $recipientName !== '' ? $recipientName : 'there',
        ENT_QUOTES,
        'UTF-8'
    );

    $mail->addAddress($recipientEmail, $recipientName);
    $mail->isHTML(true);
    $mail->Subject = 'Reset your SilipMunti password';

    $mail->Body = '
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
            <h2 style="color:#1027b5">
                Reset your SilipMunti password
            </h2>

            <p>Hello ' . $safeName . ',</p>

            <p>
                We received a request to reset the password
                for your SilipMunti account.
            </p>

            <p>
                Enter this verification code to continue:
            </p>

            <div style="margin:24px 0;padding:18px;text-align:center;background:#f3f5ff;border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;color:#1027b5">
                ' . $otp . '
            </div>

            <p>
                This code expires in 10 minutes.
                Do not share it with anyone.
            </p>

            <p>
                If you did not request a password reset,
                you can safely ignore this email.
            </p>
        </div>
    ';

    $mail->AltBody =
        'Your SilipMunti password reset code is ' .
        $otp .
        '. It expires in 10 minutes.';

    $mail->send();
}