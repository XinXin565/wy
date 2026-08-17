#!/usr/bin/env bash
# Linux one-command deployment for the License MVP.
# Usage: curl -fsSL https://raw.githubusercontent.com/XinXin565/wy/main/deploy_linux.sh | sudo bash -s -- --ip 203.0.113.10 --email ops@example.com
set -Eeuo pipefail

APP_NAME="license-mvp"
INSTALL_DIR="/opt/${APP_NAME}"
DOMAIN=""
IP_ADDRESS=""
EMAIL=""
REPO_URL="https://github.com/XinXin565/wy.git"
REPO_REF="main"

usage() {
  cat <<'EOF'
Usage: curl -fsSL https://raw.githubusercontent.com/XinXin565/wy/main/deploy_linux.sh | sudo bash -s -- (--domain license.example.com | --ip 203.0.113.10) --email ops@example.com
       sudo bash deploy_linux.sh (--domain license.example.com | --ip 203.0.113.10) --email ops@example.com [--install-dir /opt/license-mvp]

Requirements:
  - A Debian/Ubuntu or RHEL-compatible Linux server.
  - For --domain, the domain must already resolve to this server's public IP.
  - For --ip, use this server's public IPv4 address. IP certificates are short-lived.
  - TCP ports 80 and 443 must be open in the firewall/security group.
EOF
}

while (($#)); do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --ip) IP_ADDRESS="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --repo-url) REPO_URL="${2:-}"; shift 2 ;;
    --repo-ref) REPO_REF="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run this script with sudo or as root." >&2; exit 1; }
[[ -z "$DOMAIN" || -z "$IP_ADDRESS" ]] || { echo "Use either --domain or --ip, not both." >&2; exit 2; }
if [[ -n "$DOMAIN" ]]; then
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ && "$DOMAIN" == *.* ]] || { echo "A valid --domain is required." >&2; exit 2; }
  TARGET="$DOMAIN"
  CERTBOT_PROFILE_ARGS=()
elif [[ -n "$IP_ADDRESS" ]]; then
  [[ "$IP_ADDRESS" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "A valid public IPv4 address is required." >&2; exit 2; }
  IFS='.' read -r ip1 ip2 ip3 ip4 <<<"$IP_ADDRESS"
  ((ip1 <= 255 && ip2 <= 255 && ip3 <= 255 && ip4 <= 255)) || { echo "A valid public IPv4 address is required." >&2; exit 2; }
  ((ip1 != 0 && ip1 != 10 && ip1 != 127 && ip1 < 224)) || { echo "--ip must be a public IPv4 address." >&2; exit 2; }
  ! { ((ip1 == 192 && ip2 == 168)) || ((ip1 == 172 && ip2 >= 16 && ip2 <= 31)); } || { echo "--ip must be a public IPv4 address." >&2; exit 2; }
  TARGET="$IP_ADDRESS"
  CERTBOT_PROFILE_ARGS=(--preferred-profile shortlived)
else
  echo "One of --domain or --ip is required." >&2; exit 2
fi
[[ "$EMAIL" == *@*.* ]] || { echo "A valid --email is required." >&2; exit 2; }
SOURCE_DIR="$(pwd)"
FETCH_DIR=""
NEW_DATABASE=0
[[ -s "${INSTALL_DIR}/storage.sqlite" ]] || NEW_DATABASE=1
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
else
  echo "Cannot identify the Linux distribution." >&2; exit 1
fi

if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl ca-certificates tar nginx certbot python3-certbot-nginx python3-venv rsync openssl nodejs php-fpm php-cli php-sqlite3 php-opcache
  NGINX_USER="www-data"
  PHP_VERSION="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
  POOL_DIR="/etc/php/${PHP_VERSION}/fpm/pool.d"
  FPM_SERVICE="php${PHP_VERSION}-fpm"
elif command -v dnf >/dev/null || command -v yum >/dev/null; then
  PKG="$(command -v dnf || command -v yum)"
  "$PKG" install -y curl ca-certificates tar nginx certbot python3-certbot-nginx rsync openssl nodejs php php-fpm php-cli php-sqlite3 php-opcache
  NGINX_USER="nginx"
  POOL_DIR="/etc/php-fpm.d"
  FPM_SERVICE="php-fpm"
else
  echo "Unsupported distribution. Use Debian/Ubuntu or RHEL-compatible Linux." >&2; exit 1
fi

# When invoked through curl | bash, fetch the project automatically. A local
# checkout is still accepted, which makes upgrades and offline testing easier.
if [[ ! -f "$SOURCE_DIR/index.php" || ! -f "$SOURCE_DIR/bootstrap.php" ]]; then
  FETCH_DIR="$(mktemp -d /tmp/license-mvp-source.XXXXXX)"
  trap 'rm -rf "$FETCH_DIR"' EXIT
  echo "Downloading application source from ${REPO_URL} (${REPO_REF})..."
  REPO_BASE="${REPO_URL%.git}"
  curl -fL --retry 3 "${REPO_BASE%/}/archive/refs/heads/${REPO_REF}.tar.gz" -o "$FETCH_DIR/source.tar.gz"
  tar -xzf "$FETCH_DIR/source.tar.gz" -C "$FETCH_DIR"
  SOURCE_DIR="$(dirname "$(find "$FETCH_DIR" -type f -name index.php -print -quit)")"
  [[ -f "$SOURCE_DIR/bootstrap.php" ]] || { echo "Downloaded repository does not contain the application." >&2; exit 1; }
fi

CERTBOT_BIN="$(command -v certbot)"
if [[ -n "$IP_ADDRESS" ]] && ! "$CERTBOT_BIN" --help all 2>/dev/null | grep -q -- '--preferred-profile'; then
  CERTBOT_VENV="/opt/${APP_NAME}-certbot"
  python3 -m venv "$CERTBOT_VENV"
  "$CERTBOT_VENV/bin/pip" install --upgrade --quiet certbot certbot-nginx
  CERTBOT_BIN="$CERTBOT_VENV/bin/certbot"
fi

if [[ -n "$IP_ADDRESS" ]] && ! "$CERTBOT_BIN" --help all 2>/dev/null | grep -q -- '--preferred-profile'; then
  echo "The installed Certbot does not support Let's Encrypt IP certificates." >&2
  exit 1
fi

id -u "$APP_NAME" >/dev/null 2>&1 || useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_NAME"
install -d -m 0750 -o "$APP_NAME" -g "$NGINX_USER" "$INSTALL_DIR"

# Do not replace live database, RSA keys, backups, or local development files on updates.
rsync -a \
  --exclude '.git/' --exclude 'storage.sqlite*' --exclude 'rsa_private.pem' --exclude 'rsa_public.pem' \
  --exclude 'keys-backup/' --exclude 'php-runtime/' --exclude 'node_modules/' --exclude 'cpp_client/' \
  --exclude '*.obj' --exclude '*.pdb' --exclude '*.ilk' --exclude '*.backup-*' \
  "$SOURCE_DIR/" "$INSTALL_DIR/"

chown -R "$APP_NAME:$NGINX_USER" "$INSTALL_DIR"
find "$INSTALL_DIR" -type d -exec chmod 0750 {} +
find "$INSTALL_DIR" -type f -exec chmod 0640 {} +

# Create an initial v3 transport key pair only for a new installation.
if [[ ! -s "$INSTALL_DIR/rsa_private.pem" || ! -s "$INSTALL_DIR/rsa_public.pem" ]]; then
  umask 077
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$INSTALL_DIR/rsa_private.pem"
  openssl rsa -pubout -in "$INSTALL_DIR/rsa_private.pem" -out "$INSTALL_DIR/rsa_public.pem"
fi
chown "$APP_NAME:$NGINX_USER" "$INSTALL_DIR/rsa_private.pem" "$INSTALL_DIR/rsa_public.pem"
chmod 0600 "$INSTALL_DIR/rsa_private.pem"
chmod 0640 "$INSTALL_DIR/rsa_public.pem"

install -d -m 0755 /run/php
cat >/etc/tmpfiles.d/${APP_NAME}.conf <<EOF
d /run/php 0755 root root -
EOF
cat >"${POOL_DIR}/${APP_NAME}.conf" <<EOF
[${APP_NAME}]
user = ${APP_NAME}
group = ${APP_NAME}
listen = /run/php/${APP_NAME}.sock
listen.owner = ${NGINX_USER}
listen.group = ${NGINX_USER}
listen.mode = 0660
pm = dynamic
pm.max_children = 12
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 4
php_admin_flag[expose_php] = Off
php_admin_value[session.cookie_httponly] = 1
php_admin_value[session.cookie_secure] = 1
php_admin_value[session.cookie_samesite] = Lax
EOF

NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
if [[ -d /etc/nginx/sites-available ]]; then
  NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}"
fi
cat >"$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${TARGET};
    root ${INSTALL_DIR};
    index index.php;
    client_max_body_size 2m;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location = /index.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root/index.php;
        fastcgi_param SCRIPT_NAME /index.php;
        fastcgi_pass unix:/run/php/${APP_NAME}.sock;
        fastcgi_read_timeout 60s;
    }

    location ~ \.php$ { return 404; }
    location ~ /\.(?!well-known).* { deny all; }
    location ~* \.(?:pem|sqlite|sqlite3|bak|log)$ { deny all; }
}
EOF
if [[ -d /etc/nginx/sites-enabled ]]; then
  ln -sfn "$NGINX_CONF" "/etc/nginx/sites-enabled/${APP_NAME}"
  rm -f /etc/nginx/sites-enabled/default
fi

systemctl enable "$FPM_SERVICE"
systemctl restart "$FPM_SERVICE"
nginx -t
systemctl enable nginx
systemctl restart nginx

# Do not enable a firewall automatically, but open web ports when one is already active.
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 'Nginx Full'
elif command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
fi

# Initialize the SQLite database. Only a first installation replaces the unsafe development password.
if [[ "$NEW_DATABASE" -eq 1 ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)"
  APP_DIR="$INSTALL_DIR" ADMIN_PASSWORD="$ADMIN_PASSWORD" php -r '
require getenv("APP_DIR") . "/bootstrap.php";
$db = $GLOBALS["db"];
$q = $db->prepare("UPDATE admins SET password_hash=? WHERE username=?");
$q->execute([password_hash(getenv("ADMIN_PASSWORD"), PASSWORD_DEFAULT), "admin"]);
'
else
  APP_DIR="$INSTALL_DIR" php -r 'require getenv("APP_DIR") . "/bootstrap.php";'
fi
chown "$APP_NAME:$NGINX_USER" "$INSTALL_DIR/storage.sqlite" 2>/dev/null || true
chmod 0600 "$INSTALL_DIR/storage.sqlite" 2>/dev/null || true

echo "Requesting the HTTPS certificate for ${TARGET}..."
TLS_MODE="trusted"
if ! "$CERTBOT_BIN" --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect "${CERTBOT_PROFILE_ARGS[@]}" -d "$TARGET"; then
  [[ -n "$IP_ADDRESS" ]] || { echo "HTTPS certificate request failed." >&2; exit 1; }
  TLS_MODE="self-signed"
  SSL_DIR="/etc/nginx/ssl/${APP_NAME}"
  install -d -m 0700 "$SSL_DIR"
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 825 \
    -keyout "$SSL_DIR/server.key" -out "$SSL_DIR/server.crt" \
    -subj "/CN=${IP_ADDRESS}" -addext "subjectAltName=IP:${IP_ADDRESS}"
  chmod 0600 "$SSL_DIR/server.key"
  cat >>"$NGINX_CONF" <<EOF

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${IP_ADDRESS};
    root ${INSTALL_DIR};
    index index.php;
    ssl_certificate ${SSL_DIR}/server.crt;
    ssl_certificate_key ${SSL_DIR}/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;

    location / { try_files \$uri \$uri/ /index.php?\$query_string; }
    location = /index.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root/index.php;
        fastcgi_param SCRIPT_NAME /index.php;
        fastcgi_pass unix:/run/php/${APP_NAME}.sock;
        fastcgi_read_timeout 60s;
    }
    location ~ \.php$ { return 404; }
    location ~ /\.(?!well-known).* { deny all; }
    location ~* \.(?:pem|sqlite|sqlite3|bak|log)$ { deny all; }
}
EOF
fi
nginx -t
systemctl reload nginx

echo
echo "Deployment complete: https://${TARGET}/admin"
echo "Administrator account: admin"
if [[ "$NEW_DATABASE" -eq 1 ]]; then
  echo "Temporary administrator password: ${ADMIN_PASSWORD}"
  echo "Change the password after your first login."
else
  echo "Existing administrator password and application data were preserved."
fi
if [[ "$TLS_MODE" == "trusted" ]]; then
  echo "Certificate renewal is managed by certbot's system timer."
else
  echo "WARNING: The certificate authority rejected the bare IP. HTTPS uses a self-signed certificate and browsers will show a trust warning."
fi
if [[ -n "$IP_ADDRESS" && "$TLS_MODE" == "trusted" ]]; then
  echo "IP certificates are short-lived. Keep the server powered on so Certbot can renew them automatically."
fi
