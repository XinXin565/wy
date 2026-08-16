<?php
$config = require __DIR__ . '/config.php';
$GLOBALS['config']=$config;
$db = new PDO('sqlite:' . $config['db']);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('PRAGMA synchronous=FULL');
$db->exec('PRAGMA busy_timeout=5000');
if (session_status() !== PHP_SESSION_ACTIVE) { session_name('license_admin'); session_start(); }
$db->exec("CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, last_login_at TEXT)");
$db->exec("CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'readonly', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, last_used_at TEXT)");
$db->exec("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
$db->exec("CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)");
$db->exec("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, tenant_id TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)");
$db->exec("CREATE TABLE IF NOT EXISTS product_configs (id TEXT PRIMARY KEY, product_id TEXT UNIQUE NOT NULL, product_code TEXT UNIQUE NOT NULL, announcement TEXT NOT NULL DEFAULT '', announcement_enabled INTEGER NOT NULL DEFAULT 0, announcement_title TEXT NOT NULL DEFAULT '', force_read INTEGER NOT NULL DEFAULT 0, version TEXT NOT NULL DEFAULT '1.0.0', min_version TEXT NOT NULL DEFAULT '1.0.0', force_update INTEGER NOT NULL DEFAULT 0, update_url TEXT NOT NULL DEFAULT '', update_notes TEXT NOT NULL DEFAULT '', crypto_profile TEXT NOT NULL DEFAULT 'default-v3', crypto_config TEXT NOT NULL DEFAULT '{}', config_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', FOREIGN KEY(product_id) REFERENCES products(id))");
$db->exec("CREATE TABLE IF NOT EXISTS product_scripts (id TEXT PRIMARY KEY, product_id TEXT UNIQUE NOT NULL, script_source TEXT NOT NULL DEFAULT '', script_version TEXT NOT NULL DEFAULT '1', enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', FOREIGN KEY(product_id) REFERENCES products(id))");
$pcCols=$db->query('PRAGMA table_info(product_configs)')->fetchAll(PDO::FETCH_COLUMN,1);
foreach(['announcement_published_at'=>"TEXT NOT NULL DEFAULT ''",'crypto_key_version'=>"TEXT NOT NULL DEFAULT '1'",'crypto_rotation_enabled'=>"INTEGER NOT NULL DEFAULT 0",'effective_at'=>"TEXT NOT NULL DEFAULT ''"] as $cn=>$ct) if(!in_array($cn,$pcCols,true)) $db->exec("ALTER TABLE product_configs ADD COLUMN $cn $ct");
$db->exec("INSERT OR IGNORE INTO product_configs(id,product_id,product_code,updated_at) SELECT lower(hex(randomblob(16))),id,code,created_at FROM products");
$seed=$db->prepare('SELECT id FROM products WHERE code=?'); $seed->execute(['debug']); if(!$seed->fetchColumn()){ $pid=bin2hex(random_bytes(16)); $now=gmdate('c'); $db->prepare('INSERT INTO products(id,code,name,status,created_at) VALUES(?,?,?,?,?)')->execute([$pid,'debug','调试产品','active',$now]); $db->prepare('INSERT INTO product_configs(id,product_id,product_code,updated_at) VALUES(?,?,?,?)')->execute([bin2hex(random_bytes(16)),$pid,'debug',$now]); }
$productColumns=$db->query('PRAGMA table_info(products)')->fetchAll(PDO::FETCH_COLUMN,1);
if(!in_array('announcement',$productColumns,true)) $db->exec("ALTER TABLE products ADD COLUMN announcement TEXT NOT NULL DEFAULT ''");
if(!in_array('version',$productColumns,true)) $db->exec("ALTER TABLE products ADD COLUMN version TEXT NOT NULL DEFAULT '1.0.0'");
if(!in_array('secure_payload',$productColumns,true)) $db->exec("ALTER TABLE products ADD COLUMN secure_payload TEXT NOT NULL DEFAULT ''");
$cols=$db->query('PRAGMA table_info(licenses)')->fetchAll(PDO::FETCH_COLUMN,1); if(!in_array('key_cipher',$cols,true)) $db->exec('ALTER TABLE licenses ADD COLUMN key_cipher TEXT'); if(!in_array('duration_label',$cols,true)) $db->exec("ALTER TABLE licenses ADD COLUMN duration_label TEXT NOT NULL DEFAULT '永久'"); $deviceCols=$db->query('PRAGMA table_info(devices)')->fetchAll(PDO::FETCH_COLUMN,1); if(!in_array('online_status',$deviceCols,true)) $db->exec("ALTER TABLE devices ADD COLUMN online_status TEXT NOT NULL DEFAULT 'offline'"); $auditCols=$db->query('PRAGMA table_info(audit_logs)')->fetchAll(PDO::FETCH_COLUMN,1); if(!in_array('ip_address',$auditCols,true)) $db->exec("ALTER TABLE audit_logs ADD COLUMN ip_address TEXT NOT NULL DEFAULT ''");
$db->exec("CREATE TABLE IF NOT EXISTS licenses (id TEXT PRIMARY KEY, key_prefix TEXT, key_hash TEXT UNIQUE, key_verify_hash TEXT, product_code TEXT, status TEXT, max_devices INTEGER, expires_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, license_id TEXT, device_hash TEXT, device_name TEXT, status TEXT, first_seen_at TEXT, last_seen_at TEXT, UNIQUE(license_id, device_hash));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, license_id TEXT, device_id TEXT, token_hash TEXT UNIQUE, expires_at TEXT, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, license_id TEXT, device_id TEXT, result TEXT, reason TEXT, ip_address TEXT NOT NULL DEFAULT '', created_at TEXT);");
$cols=$db->query('PRAGMA table_info(licenses)')->fetchAll(PDO::FETCH_COLUMN,1);
if(!in_array('key_cipher',$cols,true)) $db->exec('ALTER TABLE licenses ADD COLUMN key_cipher TEXT');
if(!in_array('duration_label',$cols,true)) $db->exec("ALTER TABLE licenses ADD COLUMN duration_label TEXT NOT NULL DEFAULT '永久'");
$db->exec("CREATE TABLE IF NOT EXISTS audit_logs_archive AS SELECT * FROM audit_logs WHERE 0");
$db->exec("CREATE TABLE IF NOT EXISTS admin_idempotency (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL)");
$auditColumns = $db->query('PRAGMA table_info(audit_logs)')->fetchAll(PDO::FETCH_COLUMN,1);
if (!in_array('source', $auditColumns, true)) $db->exec("ALTER TABLE audit_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'admin'");
$archiveColumns = $db->query('PRAGMA table_info(audit_logs_archive)')->fetchAll(PDO::FETCH_COLUMN,1);
if (!in_array('source', $archiveColumns, true)) $db->exec("ALTER TABLE audit_logs_archive ADD COLUMN source TEXT NOT NULL DEFAULT 'admin'");
$db->exec("UPDATE audit_logs SET source='client' WHERE action IN ('activate','login','heartbeat','verify','logout')");
$db->exec("UPDATE audit_logs_archive SET source='client' WHERE action IN ('activate','login','heartbeat','verify','logout')");
// Development administrator for the local MVP. Change this password before deployment.
$adminCount = (int)$db->query("SELECT COUNT(*) FROM admins")->fetchColumn();
if ($adminCount === 0) {
    $stmt = $db->prepare('INSERT INTO admins(id,username,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?)');
    $stmt->execute([bin2hex(random_bytes(16)), 'admin', password_hash('admin123', PASSWORD_DEFAULT), 'admin', 'active', gmdate('c')]);
}
function admin_user(): ?array { return isset($_SESSION['admin_id'], $_SESSION['admin_role']) ? ['id'=>$_SESSION['admin_id'], 'username'=>$_SESSION['admin_username'] ?? 'admin', 'role'=>$_SESSION['admin_role']] : null; }
function require_admin(array $roles = []): array {
    $user = admin_user();
    if (!$user) { if (str_contains((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json')) json_response(['error'=>'admin_login_required'],401); header('Location: /admin/login'); exit; }
    if ($roles && !in_array($user['role'], $roles, true) && $user['role'] !== 'admin') json_response(['error'=>'permission_denied'],403);
    return $user;
}
function api_key_user(): ?array {
    $raw = trim((string)($_SERVER['HTTP_X_API_KEY'] ?? '')); if ($raw === '') return null;
    $q = $GLOBALS['db']->prepare('SELECT * FROM api_keys WHERE key_hash=? AND status="active"'); $q->execute([hash('sha256',$raw)]); $row=$q->fetch(PDO::FETCH_ASSOC);
    if ($row) $GLOBALS['db']->prepare('UPDATE api_keys SET last_used_at=? WHERE id=?')->execute([gmdate('c'),$row['id']]); return $row ?: null;
}
function require_api_role(string $role='readonly'): array {
    $u=api_key_user(); $rank=['readonly'=>1,'operator'=>2,'admin'=>3];
    if (!$u || ($rank[$u['role']]??0) < ($rank[$role]??1)) json_response(['error'=>'api_key_required'],401); return $u;
}
function csrf_token(): string { if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token']=bin2hex(random_bytes(24)); return $_SESSION['csrf_token']; }
function verify_csrf(): void { $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??''); if (!hash_equals(csrf_token(),$token)) json_response(['error'=>'csrf_token_invalid'],419); }
function verify_idempotency(PDO $db, array $body): void {
    $key=trim((string)($_SERVER['HTTP_IDEMPOTENCY_KEY']??'')); if($key==='') return;
    if(!preg_match('/^[A-Za-z0-9._:-]{8,128}$/',$key)) json_response(['error'=>'invalid_idempotency_key'],400);
    $hash=hash('sha256',json_encode($body,JSON_UNESCAPED_SLASHES));
    $existing=$db->prepare('SELECT request_hash,response_json,status_code FROM admin_idempotency WHERE id=?'); $existing->execute([$key]); $row=$existing->fetch(PDO::FETCH_ASSOC);
    if($row){
        if(!hash_equals((string)$row['request_hash'],$hash)) json_response(['error'=>'idempotency_key_reused'],409);
        if((string)$row['response_json']!=='') { $GLOBALS['idempotency_replay_raw']=(string)$row['response_json']; $GLOBALS['idempotency_replay_status']=(int)$row['status_code'] ?: 200; replay_json_response(); }
        json_response(['error'=>'request_in_progress'],409);
    }
    $q=$db->prepare('INSERT INTO admin_idempotency(id,request_hash,response_json,status_code,created_at) VALUES(?,?,?,?,?)'); $q->execute([$key,$hash,'',0,gmdate('c')]);
    $GLOBALS['idempotency_key']=$key;
    $db->exec("DELETE FROM admin_idempotency WHERE created_at < '".gmdate('c',time()-86400)."'");
}
function replay_json_response(): never { $requestId=(string)($_SERVER['HTTP_X_REQUEST_ID']??''); if($requestId!=='') header('X-Request-ID: '.$requestId); http_response_code((int)($GLOBALS['idempotency_replay_status']??200)); header('Content-Type: application/json'); echo (string)($GLOBALS['idempotency_replay_raw']??'{}'); exit; }
function verify_request_signature(array $config, string $method, string $path, string $rawBody): void {
    $timestamp=$_SERVER['HTTP_X_REQUEST_TIMESTAMP']??''; $nonce=$_SERVER['HTTP_X_REQUEST_NONCE']??''; $digest=$_SERVER['HTTP_X_BODY_MD5']??''; $signature=$_SERVER['HTTP_X_REQUEST_SIGNATURE']??'';
    if(!ctype_digit($timestamp) || abs(time()-(int)$timestamp)>120 || !preg_match('/^[A-Za-z0-9_-]{16,128}$/',$nonce) || !hash_equals(strtolower(md5($rawBody)),strtolower($digest))) json_response(['error'=>'invalid_request_signature'],401);
    $key=__DIR__.'/rsa_public.pem'; if(!is_file($key)) json_response(['error'=>'rsa_public_key_not_configured'],503); $canonical=$method."\n".$path."\n".strtolower($digest)."\n".$timestamp."\n".$nonce; $sig=base64_decode($signature,true); $ok=$sig!==false && openssl_verify($canonical,$sig, file_get_contents($key), OPENSSL_ALGO_SHA256)===1; if(!$ok) json_response(['error'=>'invalid_rsa_signature'],401);
    $db=$GLOBALS['db']; $st=$db->prepare('CREATE TABLE IF NOT EXISTS request_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER)'); $st->execute(); try{$db->prepare('INSERT INTO request_nonces VALUES(?,?)')->execute([$nonce,time()+600]);}catch(Throwable $e){json_response(['error'=>'nonce_replayed'],409);} $db->exec('DELETE FROM request_nonces WHERE expires_at < '.time());
}
function json_response(array $body, int $status = 200): never {
    $requestId=$_SERVER['HTTP_X_REQUEST_ID']??bin2hex(random_bytes(8)); header('X-Request-ID: '.$requestId); $original=$body; $isError=($status>=400 || isset($body['error'])); $body['ok']=!$isError; $body['data']=$isError?null:$original; if($isError){$body['code']=(string)($body['error']??'request_failed');$body['message']=(string)($body['message']??$body['error']??'请求失败');$body['fields']=$body['fields']??new stdClass();} $body['request_id']=$requestId;
    if(!empty($GLOBALS['idempotency_key'])) { $q=$GLOBALS['db']->prepare('UPDATE admin_idempotency SET response_json=?,status_code=? WHERE id=?'); $q->execute([json_encode($body,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE),$status,$GLOBALS['idempotency_key']]); }
    http_response_code($status); if($key=$GLOBALS['secure_binary_context']??null){$iv=random_bytes(12);$tag='';$cipher=openssl_encrypt(json_encode($body,JSON_UNESCAPED_SLASHES),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'');header('Content-Type: application/octet-stream');echo "LR3\0".$iv.$tag.$cipher;exit;} header('Content-Type: application/json'); $ctx=$GLOBALS['secure_context']??null; if($ctx){[$path,$request,$key]=$ctx;$iv=random_bytes(12);$tag='';$cipher=openssl_encrypt(json_encode($body,JSON_UNESCAPED_SLASHES),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'');echo json_encode(['v'=>2,'iv'=>rtrim(strtr(base64_encode($iv),'+/','-_'),'='),'ciphertext'=>rtrim(strtr(base64_encode($cipher),'+/','-_'),'='),'tag'=>rtrim(strtr(base64_encode($tag),'+/','-_'),'=')]);exit;} echo json_encode($body, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); exit;
}
function input_json(): array { $data = json_decode(file_get_contents('php://input'), true); return is_array($data) ? $data : []; }
function client_ip(): string { $remote=(string)($_SERVER['REMOTE_ADDR']??''); $forwarded=(string)($_SERVER['HTTP_X_FORWARDED_FOR']??''); $real=(string)($_SERVER['HTTP_X_REAL_IP']??''); foreach([$real,$forwarded,$remote] as $candidate){$candidate=trim(explode(',',$candidate)[0]); if(filter_var($candidate,FILTER_VALIDATE_IP)) return $candidate;} return $remote; }
function audit(PDO $db, string $action, ?string $license, ?string $device, string $result, string $reason=''): void { $source=in_array($action,['activate','login','heartbeat','verify','logout'],true)?'client':'admin'; $q=$db->prepare('INSERT INTO audit_logs(action,license_id,device_id,result,reason,ip_address,created_at,source) VALUES(?,?,?,?,?,?,?,?)'); $q->execute([$action,$license,$device,$result,$reason,client_ip(),gmdate('c'),$source]); }
function archive_audit(PDO $db, int $beforeId): int { $q=$db->prepare('INSERT INTO audit_logs_archive SELECT * FROM audit_logs WHERE id<=?'); $q->execute([$beforeId]); $count=$q->rowCount(); if($count){$db->prepare('DELETE FROM audit_logs WHERE id<=?')->execute([$beforeId]);} return $count; }
function key_encrypt(string $key,string $secret): string { if(!function_exists('openssl_encrypt')) throw new RuntimeException('OpenSSL extension is required for key management encryption'); $iv=random_bytes(16); return base64_encode($iv.openssl_encrypt($key,'aes-256-cbc',hash('sha256',$secret,true),OPENSSL_RAW_DATA,$iv)); }
function key_decrypt(?string $cipher,string $secret): string { if(!$cipher||!function_exists('openssl_decrypt')) return ''; $raw=base64_decode($cipher,true); return $raw&&strlen($raw)>16?(string)openssl_decrypt(substr($raw,16),'aes-256-cbc',hash('sha256',$secret,true),OPENSSL_RAW_DATA,substr($raw,0,16)):''; }
function b64u_decode(string $value): string|false { return base64_decode(strtr($value,'-_','+/').str_repeat('=',(4-strlen($value)%4)%4),true); }
function secure_envelope(array $config, string $path, array $envelope): array {
    foreach(['key','iv','ciphertext','tag','timestamp','nonce'] as $field) if(empty($envelope[$field])) json_response(['error'=>'invalid_envelope'],400);
    if(!ctype_digit((string)$envelope['timestamp']) || abs(time()-(int)$envelope['timestamp'])>$config['clock_skew']) json_response(['error'=>'envelope_expired'],401);
    if(!preg_match('/^[A-Za-z0-9_-]{16,128}$/',$envelope['nonce'])) json_response(['error'=>'invalid_nonce'],400);
    $db=$GLOBALS['db']; $db->exec('CREATE TABLE IF NOT EXISTS secure_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER)'); try{$db->prepare('INSERT INTO secure_nonces VALUES(?,?)')->execute([$envelope['nonce'],time()+600]);}catch(Throwable $e){json_response(['error'=>'nonce_replayed'],409);} $db->exec('DELETE FROM secure_nonces WHERE expires_at<'.time());
    if(!is_file($config['transport_private_key'])) json_response(['error'=>'transport_key_unavailable'],503); $wrapped=b64u_decode($envelope['key']); $private=openssl_pkey_get_private('file://'.$config['transport_private_key']); if(!$private||!openssl_private_decrypt($wrapped,$sessionKey,$private,OPENSSL_PKCS1_OAEP_PADDING)) json_response(['error'=>'invalid_key_envelope'],401);
    $iv=b64u_decode($envelope['iv']);$cipher=b64u_decode($envelope['ciphertext']);$tag=b64u_decode($envelope['tag']);$plain=openssl_decrypt($cipher,'aes-256-gcm',$sessionKey,OPENSSL_RAW_DATA,$iv,$tag,''); if($plain===false)json_response(['error'=>'invalid_ciphertext'],401); $data=json_decode($plain,true); if(!is_array($data)||($data['_path']??'')!==$path||($data['_timestamp']??'')!==(string)$envelope['timestamp']||($data['_nonce']??'')!==$envelope['nonce'])json_response(['error'=>'invalid_payload'],401); unset($data['_path'],$data['_timestamp'],$data['_nonce']); return [$data,$sessionKey];
}
function secure_response(string $path,array $request,string $key,array $payload): never { $iv=random_bytes(12);$tag='';$aad='v2|'.$path.'|'.$request['timestamp'].'|'.$request['nonce'];$cipher=openssl_encrypt(json_encode($payload,JSON_UNESCAPED_SLASHES),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,$aad);json_response(['v'=>2,'iv'=>rtrim(strtr(base64_encode($iv),'+/','-_'),'='),'ciphertext'=>rtrim(strtr(base64_encode($cipher),'+/','-_'),'='),'tag'=>rtrim(strtr(base64_encode($tag),'+/','-_'),'=')]); }
function secure_binary_envelope(array $config, string $path, string $packet): array {
    // LK3\0 + wrapped RSA key (256) + IV (12) + GCM tag (16) + ciphertext.
    if(strlen($packet)<289 || substr($packet,0,4)!=="LK3\0") json_response(['error'=>'invalid_packet'],400);
    $wrapped=substr($packet,4,256); $iv=substr($packet,260,12); $tag=substr($packet,272,16); $cipher=substr($packet,288);
    $private=openssl_pkey_get_private('file://'.$config['transport_private_key']); if(!$private||!openssl_private_decrypt($wrapped,$sessionKey,$private,OPENSSL_PKCS1_OAEP_PADDING))json_response(['error'=>'invalid_key_envelope'],401);
    $plain=openssl_decrypt($cipher,'aes-256-gcm',$sessionKey,OPENSSL_RAW_DATA,$iv,$tag,''); $data=json_decode((string)$plain,true); if(!is_array($data)||empty($data['_timestamp'])||empty($data['_nonce'])||($data['_path']??'')!==$path)json_response(['error'=>'invalid_ciphertext'],401);
    if(abs(time()-(int)$data['_timestamp'])>$config['clock_skew'])json_response(['error'=>'envelope_expired'],401); if(!preg_match('/^[A-Za-z0-9_-]{16,128}$/',$data['_nonce']))json_response(['error'=>'invalid_nonce'],400);
    $db=$GLOBALS['db'];$db->exec('CREATE TABLE IF NOT EXISTS secure_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER)');try{$db->prepare('INSERT INTO secure_nonces VALUES(?,?)')->execute([$data['_nonce'],time()+600]);}catch(Throwable $e){json_response(['error'=>'nonce_replayed'],409);}$db->exec('DELETE FROM secure_nonces WHERE expires_at<'.time());if($path==='/api/v3/products/execute'){ $license=trim((string)($data['license_key']??''));$code=trim((string)($data['product_code']??''));$device=trim((string)($data['device_id']??''));if($license===''||$code===''||$device==='')json_response(['error'=>'script_authorization_required'],401);$q=$db->prepare('SELECT id,status,expires_at,product_code FROM licenses WHERE key_hash=? AND product_code=?');$q->execute([hash_hmac('sha256',$license,$GLOBALS['config']['pepper']),$code]);$lic=$q->fetch(PDO::FETCH_ASSOC);if(!$lic)json_response(['error'=>'invalid_license'],401);if(in_array($lic['status'],['suspended','revoked'],true))json_response(['error'=>'license_suspended'],403);if($lic['expires_at']&&strtotime($lic['expires_at'])<=time())json_response(['error'=>'license_expired'],403);$q=$db->prepare('SELECT id FROM devices WHERE license_id=? AND device_hash=? AND status="active"');$q->execute([$lic['id'],hash('sha256',$device)]);if(!$q->fetchColumn())json_response(['error'=>'device_not_bound'],403);}$GLOBALS['secure_binary_context']=$sessionKey;unset($data['_timestamp'],$data['_nonce'],$data['_path']);return[$data,$sessionKey];
}
function secure_binary_response(string $key,array $payload): never { $iv=random_bytes(12);$tag='';$cipher=openssl_encrypt(json_encode($payload,JSON_UNESCAPED_SLASHES),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'');header('Content-Type: application/octet-stream');echo "LR3\0".$iv.$tag.$cipher;exit; }
