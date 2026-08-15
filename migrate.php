<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$tables = ['admins','api_keys','system_settings','tenants','products','licenses','devices','sessions','audit_logs','audit_logs_archive','admin_idempotency'];
$missing = [];
foreach ($tables as $table) {
    $q = $db->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
    $q->execute([$table]);
    if (!$q->fetchColumn()) $missing[] = $table;
}
if ($missing) { fwrite(STDERR, 'MIGRATION CHECK FAILED: ' . implode(', ', $missing) . PHP_EOL); exit(1); }
echo 'MIGRATION CHECK OK: ' . count($tables) . " tables" . PHP_EOL;
