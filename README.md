# SilipMunti

SilipMunti is a web-based rental property discovery and management system for Muntinlupa City. It connects renters with landlords through property listings, location information, AI-assisted rental guidance, inquiries, and messaging. Administrators manage landlord verification, listings, users, rental types, and reports.

## Project status

The system is under local development and evaluation. Core workflows have been reported as working during developer testing. Deployment, performance under concurrent use, and the final hosting configuration require validation in the target environment. This README does not certify production readiness.

## User roles and features

| Role          | Features                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renter        | Account registration and email OTP, property search and filters, listing details and photos, saved properties, AI rental assistance, inquiries, messaging, and reviews |
| Landlord      | Verification document submission, property management, multiple listing photos, availability updates, inquiries, and messaging                                         |
| Administrator | Dashboard, verification review, listing and user management, rental type management, reports, and Excel/Word/PDF exports                                               |

Shared account features include login, logout, password recovery, profile management, and protected email changes.

## Technology stack

- HTML, CSS, and JavaScript frontend
- PHP backend with PDO prepared statements
- MySQL/MariaDB database
- Apache, with XAMPP used for local development
- Composer and PHPMailer for email delivery
- Google Gemini API for conversational rental assistance
- Cloudflare Turnstile for configured security challenges
- Leaflet and OpenStreetMap for property maps

Map display is separate from Street View. Do not assume that Street View is included.

## Requirements

- PHP 8.1 or later, with PDO MySQL, cURL, mbstring, Fileinfo, and OpenSSL enabled
- A compatible MySQL/MariaDB server
- Apache with `.htaccess` overrides permitted and `mod_rewrite` and `mod_headers` enabled
- Composer
- A modern web browser
- SMTP credentials for OTP and account email delivery
- Gemini credentials for AI-generated responses
- Turnstile configuration when its challenge is enabled

Internet connectivity is needed for email, AI services, map tiles, and externally hosted frontend resources.

## Project structure

```text
SilipMunti/
├── frontend/
│   ├── assets/
│   ├── pages/
│   └── index.html
├── backend/
│   ├── admin/
│   ├── ai/
│   ├── auth/
│   ├── config/
│   ├── landlord/
│   ├── listings/
│   ├── middleware/
│   ├── security/
│   ├── storage/
│   ├── .env.example
│   ├── .htaccess
│   └── composer.json
├── .htaccess
└── README.md
```

This is a summary of the main directories, not an exhaustive file inventory.

## Local setup with XAMPP

1. Place the project in `C:\xampp\htdocs\SilipMunti`.
2. Start Apache and MySQL in the XAMPP Control Panel.
3. Create the `silip_munti` database and import the latest approved SQL export using phpMyAdmin. Use an export matching the current code, including previously applied schema changes.
4. Open a terminal in `SilipMunti/backend` and install dependencies:

   ```bash
   composer install
   ```

5. Copy `backend/.env.example` to `backend/.env` and configure the values described below. Preserve an existing working `.env` rather than overwriting it.
6. Ensure Apache/PHP can write to the required upload storage directories without granting unrestricted permissions to the entire project.
7. Open:

   ```text
   http://localhost/SilipMunti/frontend/index.html
   ```

The application uses `/SilipMunti/frontend` and `/SilipMunti/backend` paths in multiple locations. Renaming the project directory requires reviewing those references.

## Environment configuration

| Settings                                                          | Purpose                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`     | Database connection                                      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION`                       | SMTP server and transport                                |
| `SMTP_USERNAME`, `SMTP_PASSWORD`                                  | SMTP authentication                                      |
| `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`                               | Sender identity                                          |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                  | Gemini access and model selection                        |
| `APP_SECURITY_KEY`                                                | Application security key; use a randomly generated value |
| `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Turnstile integration                                    |
| `TURNSTILE_ALLOWED_HOSTNAMES`                                     | Application-side accepted challenge hostnames            |

For Gmail SMTP, use an appropriate app password when required by the account configuration. Never use example credentials as real credentials.

The hostname must also be permitted in the Turnstile widget configuration. The application environment setting alone does not configure the Cloudflare dashboard. Replace development test keys before public use.

Keep `.env`, credentials, backups, and private verification documents out of public repositories and public download locations. Do not regenerate an existing application security key without checking its dependent features.

## Property images and documents

- Listing photos support JPG, PNG, and WebP, with up to 10 images per listing and a maximum of 5 MB per image.
- Server upload limits must accommodate the actual request size. `post_max_size` must allow the complete multipart request; `upload_max_filesize` must allow each permitted file.
- Verification documents are private and must be accessed through authorized delivery endpoints.
- Upload storage must not execute uploaded scripts.
- Backups must include uploaded files as well as the database.

## AI assistance

The assistant uses conversation history and read-only database tools for public landlord and property information. Conversational listing results can be displayed as clickable property cards. Ordinary recommendation searches retain the existing ranking flow.

Search eligibility checks restrict available recommendations to verified, available, non-deleted listings owned by approved, non-deleted landlords. A specific property detail lookup can report a different current availability status; displaying details is not a promise that the property is available.

AI functionality depends on provider availability, model access, and applicable quotas. An AI failure must not be interpreted as proof that no listings exist. Normal property browsing remains a separate workflow. General rental advice does not establish a landlord's actual terms or guarantee a property's suitability.

## Security design

The current implementation includes session-based authentication, session-version checks, role-based authorization, approved-landlord checks, session-bound CSRF tokens for protected modifying requests, ownership checks, prepared SQL statements, upload validation, and restricted document access.

Security depends on applying these controls consistently across endpoints. Hidden buttons and filtered dashboards do not replace backend authorization. Read-only HTTP methods must not modify application data.

## Testing checklist

- Registration, email OTP, login, logout, password recovery, and email changes
- Old-session invalidation after password reset
- Landlord verification and admin review
- Listing creation with multiple images, editing, deletion, and availability updates
- Property search, favorites, maps, AI follow-ups, and correct property-card destinations
- Inquiries, messaging, notifications, and reviews
- Admin filters, reports, and exported Excel/Word/PDF documents
- Cross-account update/delete/image requests rejected without modifying records
- Renter access to landlord/admin actions rejected
- Missing, invalid, or expired CSRF tokens rejected
- Invalid and oversized uploads rejected with clear feedback
- Desktop, tablet, and mobile usability
- Concurrent use, error handling, and external-service failures

Use disposable records for destructive tests. Record expected results, actual results, and supporting evidence. Use synthetic documents and avoid collecting unnecessary personal information during evaluation.

## Troubleshooting

| Symptom                     | Check                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Database connection fails   | MySQL service, environment credentials, database name, and imported schema           |
| OTP email does not arrive   | SMTP configuration, provider requirements, spam folder, and server logs              |
| AI is unavailable           | Gemini key, model access, quota, cURL/TLS configuration, and server-side diagnostics |
| Turnstile fails             | Widget keys, allowed hostnames, connectivity, and browser blocking                   |
| Request returns `419`       | Refresh the page to obtain a current CSRF token and retry                            |
| Image upload fails          | File type, file size, image count, PHP limits, and storage permissions               |
| Page returns `403` or `404` | Session role, ownership, resource existence, and Apache access rules                 |

Inspect Apache/PHP error logs for technical details. Do not log passwords, OTPs, session cookies, API keys, or private document contents. Disable public error display outside development while retaining server-side error logging.

## Backup and deployment

Before testing batches or significant changes, back up the current code, database, and uploaded files. Store backups privately and verify restoration in an isolated environment.

Before deployment, validate HTTPS, secure session cookies, database privileges, environment protection, private document delivery, upload restrictions, email delivery, external integrations, error logging, and backup restoration on the target host. Do not upload Git metadata, local backups, or development/bootstrap utilities to a public web directory.

## Project ownership

SilipMunti is an academic capstone project developed by Krizzy Shane T. Gozo, Andrey Kurt L. La Torre, and Edrian Nazareth P. Pagobo in partial fulfillment of the requirements for the Bachelor of Science in Information Technology (BSIT) program at Pamantasan ng Lungsod ng Muntinlupa. This README does not grant an open-source license.
