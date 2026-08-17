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

## Linux 一键部署（Nginx + HTTPS）

将整个 `mvp` 目录上传到 Linux 服务器后，在项目根目录执行：

```bash
sudo bash deploy_linux.sh --ip 服务器公网IP --email ops@example.com
```

不上传项目文件也可以直接部署，服务器执行：

```bash
curl -fsSL 'https://raw.githubusercontent.com/XinXin565/wy/main/%E5%8D%A1%E5%AF%86%E9%AA%8C%E8%AF%81%E7%B3%BB%E7%BB%9F/mvp/deploy_linux.sh' | sudo bash -s -- --ip 服务器公网IP --email ops@example.com
```

脚本会自动下载 `main` 分支源码；如需其他仓库或分支，可追加 `--repo-url` 和 `--repo-ref`。

脚本支持 Debian/Ubuntu 和 RHEL 系发行版，会安装 Nginx、PHP-FPM、SQLite、OpenSSL、Node.js 与 Certbot，自动申请 Let’s Encrypt 证书并把 HTTP 跳转到 HTTPS。无需域名时使用 `--ip` 传入服务器公网 IPv4；IP 证书有效期较短，脚本会交给 Certbot 自动续期。也可用 `--domain license.example.com` 使用域名证书。执行前须确保目标域名已解析或目标 IP 即为本机公网 IP，且安全组/防火墙已放行 TCP `80` 与 `443`。

部署完成后访问 `https://服务器公网IP/admin`。脚本会生成一次性管理员密码并打印在终端；请首次登录后立即修改。再次执行脚本会保留现有 SQLite 数据库、RSA 密钥和密钥备份。
