<?php
declare(strict_types=1);

$runtimeEnvironment = strtolower(trim((string)(getenv('APP_ENV') ?: '')));
if ($runtimeEnvironment === '') {
    $runtimeEnvironment = in_array(PHP_SAPI, ['cli', 'cli-server'], true) ? 'development' : 'production';
}
$allowLegacyDefaults = $runtimeEnvironment !== 'production' && getenv('LICENSE_ALLOW_INSECURE_DEFAULTS') !== '0';
$runtimeSecret = static function (string $name, string $legacy) use ($allowLegacyDefaults): string {
    $value = getenv($name);
    if ($value !== false && $value !== '') {
        if (strlen($value) < 32) {
            throw new RuntimeException("Runtime secret {$name} must be at least 32 characters");
        }
        return $value;
    }
    if ($allowLegacyDefaults) {
        return $legacy;
    }
    throw new RuntimeException("Missing required runtime secret: {$name}");
};

return [
    'db' => __DIR__ . '/storage.sqlite',
    'pepper' => $runtimeSecret('LICENSE_KEY_PEPPER', 'change-this-development-pepper'),
    'hmac_secret' => $runtimeSecret('REQUEST_HMAC_SECRET', 'change-this-development-secret'),
    'clock_skew' => 120,
    'session_ttl' => 1800,
    'rsa_public_key' => getenv('LICENSE_RSA_PUBLIC_KEY') ?: '',
    'manage_secret' => $runtimeSecret('LICENSE_MANAGE_SECRET', 'change-this-management-secret-32chars'),
    'transport_private_key' => getenv('LICENSE_TRANSPORT_PRIVATE_KEY') ?: __DIR__ . '/rsa_private.pem',
    'transport_public_key' => getenv('LICENSE_TRANSPORT_PUBLIC_KEY') ?: __DIR__ . '/rsa_public.pem',
];
