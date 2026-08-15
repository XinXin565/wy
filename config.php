<?php
return [
    'db' => __DIR__ . '/storage.sqlite',
    'pepper' => getenv('LICENSE_KEY_PEPPER') ?: 'change-this-development-pepper',
    'hmac_secret' => getenv('REQUEST_HMAC_SECRET') ?: 'change-this-development-secret',
    'clock_skew' => 120,
    'session_ttl' => 1800,
    'rsa_public_key' => getenv('LICENSE_RSA_PUBLIC_KEY') ?: '',
    'manage_secret' => getenv('LICENSE_MANAGE_SECRET') ?: 'change-this-management-secret-32chars',
    'transport_private_key' => getenv('LICENSE_TRANSPORT_PRIVATE_KEY') ?: __DIR__ . '/rsa_private.pem',
    'transport_public_key' => getenv('LICENSE_TRANSPORT_PUBLIC_KEY') ?: __DIR__ . '/rsa_public.pem',
];
