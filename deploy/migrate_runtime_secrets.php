<?php
declare(strict_types=1);

$options = getopt('', ['db:']);
$dbPath = (string)($options['db'] ?? '');
if ($dbPath === '' || !is_file($dbPath)) {
    fwrite(STDERR, "database path is required\n");
    exit(2);
}

$newPepper = getenv('LICENSE_KEY_PEPPER') ?: '';
$newManageSecret = getenv('LICENSE_MANAGE_SECRET') ?: '';
if (strlen($newPepper) < 32 || strlen($newManageSecret) < 32) {
    fwrite(STDERR, "new runtime secrets are missing or too short\n");
    exit(2);
}
$legacyPepper = getenv('LEGACY_LICENSE_KEY_PEPPER') ?: 'change-this-development-pepper';
$legacyManageSecret = getenv('LEGACY_LICENSE_MANAGE_SECRET') ?: 'change-this-management-secret-32chars';

function decrypt_legacy(?string $cipher, string $secret): string
{
    if (!$cipher || !function_exists('openssl_decrypt')) {
        return '';
    }
    $raw = base64_decode($cipher, true);
    if ($raw === false || strlen($raw) <= 16) {
        return '';
    }
    $plain = openssl_decrypt(
        substr($raw, 16),
        'aes-256-cbc',
        hash('sha256', $secret, true),
        OPENSSL_RAW_DATA,
        substr($raw, 0, 16)
    );
    return is_string($plain) ? $plain : '';
}

function encrypt_runtime(string $plain, string $secret): string
{
    $iv = random_bytes(16);
    $cipher = openssl_encrypt(
        $plain,
        'aes-256-cbc',
        hash('sha256', $secret, true),
        OPENSSL_RAW_DATA,
        $iv
    );
    if (!is_string($cipher)) {
        throw new RuntimeException('key encryption failed');
    }
    return base64_encode($iv . $cipher);
}

function table_columns(PDO $db, string $table): array
{
    $quoted = str_replace('"', '""', $table);
    return $db->query('PRAGMA table_info("' . $quoted . '")')->fetchAll(PDO::FETCH_COLUMN, 1);
}

$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
$marker = $db->prepare('SELECT value FROM system_settings WHERE key=?');
$marker->execute(['runtime_secrets_version']);
if ((string)$marker->fetchColumn() === '2') {
    echo json_encode(['status' => 'already_migrated', 'version' => 2], JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit(0);
}

$licensesMigrated = 0;
$licensesWithoutPlaintext = 0;
$scriptsMigrated = 0;
$db->beginTransaction();
try {
    $columns = table_columns($db, 'licenses');
    if (in_array('key_hash', $columns, true) && in_array('key_cipher', $columns, true)) {
        $rows = $db->query('SELECT id,key_cipher FROM licenses')->fetchAll(PDO::FETCH_ASSOC);
        $update = $db->prepare('UPDATE licenses SET key_hash=?, key_cipher=? WHERE id=?');
        foreach ($rows as $row) {
            $plain = decrypt_legacy($row['key_cipher'] ?? null, $legacyManageSecret);
            if ($plain === '') {
                $licensesWithoutPlaintext++;
                continue;
            }
            $normalized = preg_replace('/[^A-Za-z0-9]/', '', $plain) ?: $plain;
            $update->execute([
                hash_hmac('sha256', $normalized, $newPepper),
                encrypt_runtime($plain, $newManageSecret),
                $row['id'],
            ]);
            $licensesMigrated++;
        }
    }

    $scriptColumns = table_columns($db, 'product_scripts');
    if (in_array('id', $scriptColumns, true) && in_array('script_source', $scriptColumns, true) && in_array('script_signature', $scriptColumns, true)) {
        $rows = $db->query('SELECT id,script_source,script_hash FROM product_scripts')->fetchAll(PDO::FETCH_ASSOC);
        $update = $db->prepare('UPDATE product_scripts SET script_hash=?, script_signature=? WHERE id=?');
        foreach ($rows as $row) {
            $hash = (string)($row['script_hash'] ?? '');
            if ($hash === '') {
                $hash = hash('sha256', (string)$row['script_source']);
            }
            $update->execute([$hash, hash_hmac('sha256', $hash, $newPepper), $row['id']]);
            $scriptsMigrated++;
        }
    }

    $now = gmdate('c');
    $save = $db->prepare('INSERT INTO system_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
    $save->execute(['runtime_secrets_version', '2', $now]);
    $save->execute(['runtime_secrets_rotated_at', $now, $now]);
    $db->commit();
} catch (Throwable $error) {
    $db->rollBack();
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}

echo json_encode([
    'status' => 'migrated',
    'version' => 2,
    'licenses_migrated' => $licensesMigrated,
    'licenses_without_plaintext' => $licensesWithoutPlaintext,
    'scripts_migrated' => $scriptsMigrated,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
