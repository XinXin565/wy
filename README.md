# 卡密验证系统 MVP

## 运行

```powershell
php -S 127.0.0.1:8080 index.php
```

生成卡密：`POST /admin/licenses`，JSON 示例：`{"count":2,"product_code":"xinxin-desktop","max_devices":1}`。

激活：`POST /api/v1/licenses/activate`，字段为 `license_key`、`product_code`、`device_id`，可选 `device_name`、`expires_at`。

验证：`POST /api/v1/licenses/verify`，请求头 `Authorization: Bearer <session_token>`。

验证请求还必须携带 `X-Request-Timestamp`（Unix 秒）、`X-Request-Nonce`（16-128 位随机文本）、`X-Body-MD5`（原始 JSON 的 MD5）和 `X-Request-Signature`（RSA-SHA256 签名）。签名原文为：`METHOD\\nPATH\\nMD5\\nTIMESTAMP\\nNONCE`。服务端公钥放在 `mvp/rsa_public.pem`，客户端使用对应 RSA 私钥签名。

MVP 使用 SQLite；生产阶段迁移 Laravel migrations 到 PostgreSQL，并将 nonce、限流、队列和 Ed25519 响应签名接入 Redis/密钥管理服务。
## 运维与验证

本地启动：

```powershell
php-runtime\php.exe -S 127.0.0.1:8080 index.php
```

后台：`http://127.0.0.1:8080/admin/login`

默认开发账号：`admin / admin123`

检查与回归：

```powershell
.\smoke_test.ps1
node playwright_smoke.mjs
php-runtime\php.exe -c php-runtime\php.ini -d extension_dir=php-runtime\ext migrate.php
```

数据运维：`.\backup.ps1` 创建 SQLite 备份，`.\restore.ps1 -InputFile <备份文件>` 恢复。恢复前会自动保留当前数据库副本。
