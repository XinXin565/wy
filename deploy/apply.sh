#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="license-mvp"
INSTALL_DIR="/opt/${APP_NAME}"
BACKUP_ROOT="/opt/${APP_NAME}-backups"
RELEASE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/release-${STAMP}"

log() { printf '[apply] %s\n' "$*"; }
die() { printf '[apply] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'printf "[apply] ERROR at line %s\n" "$LINENO" >&2' ERR

[[ "${EUID}" -eq 0 ]] || die "run as root"
[[ -f "${RELEASE_ROOT}/index.php" ]] || die "index.php missing from release"
[[ -f "${RELEASE_ROOT}/bootstrap.php" ]] || die "bootstrap.php missing from release"
[[ -f "${RELEASE_ROOT}/script_executor.mjs" ]] || die "script_executor.mjs missing from release"
[[ -f "${RELEASE_ROOT}/deploy/nginx/license-mvp" ]] || die "Nginx site config missing"
[[ -f "${RELEASE_ROOT}/deploy/nginx/license-mvp-security.conf" ]] || die "Nginx security config missing"
[[ -f "${RELEASE_ROOT}/deploy/system/license-script-runner.wrapper" ]] || die "runner wrapper missing"
[[ -f "${RELEASE_ROOT}/deploy/system/license-script-runner.sudoers" ]] || die "sudoers file missing"

if ! id -u "${APP_NAME}" >/dev/null 2>&1; then
  useradd --system --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin "${APP_NAME}"
fi
if ! id -u script-runner >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin script-runner
fi

NGINX_USER="$(id -u www-data >/dev/null 2>&1 && printf www-data || printf nginx)"
id -u "${NGINX_USER}" >/dev/null 2>&1 || die "Nginx user not found"

FPM_SERVICE="$(systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '$1 ~ /^php[0-9.]+-fpm.service$/ {print $1; exit}')"
if [[ -z "${FPM_SERVICE}" ]]; then
  FPM_SERVICE="php8.2-fpm"
fi
systemctl cat "${FPM_SERVICE}" >/dev/null 2>&1 || die "PHP-FPM service not found: ${FPM_SERVICE}"

mkdir -p "${BACKUP_DIR}"
if [[ -d "${INSTALL_DIR}" ]]; then
  log "backup ${INSTALL_DIR} -> ${BACKUP_DIR}/application"
  mkdir -p "${BACKUP_DIR}/application"
  cp -a "${INSTALL_DIR}"/. "${BACKUP_DIR}/application/"
fi

backup_path() {
  local source="$1"
  local relative="${source#/}"
  if [[ -e "${source}" || -L "${source}" ]]; then
    mkdir -p "${BACKUP_DIR}/system/$(dirname "${relative}")"
    cp -a "${source}" "${BACKUP_DIR}/system/${relative}"
  fi
}

backup_path /etc/nginx/conf.d/license-mvp-security.conf
backup_path /etc/nginx/sites-available/license-mvp
backup_path /etc/nginx/sites-enabled/license-mvp
backup_path /usr/local/libexec/license-script-runner
backup_path /etc/sudoers.d/license-script-runner
backup_path /usr/local/lib/license-mvp-script-runner/script_executor.mjs

mkdir -p "${INSTALL_DIR}"
log "sync application source from ${RELEASE_ROOT}"
command -v rsync >/dev/null 2>&1 || die "rsync is required"
rsync -a \
  --exclude '.git/' \
  --exclude 'deploy/' \
  --exclude 'storage.sqlite*' \
  --exclude 'rsa_private.pem' \
  --exclude 'rsa_public.pem' \
  --exclude 'keys-backup/' \
  --exclude 'php-runtime/' \
  --exclude 'node_modules/' \
  --exclude 'cpp_client/' \
  --exclude '*.obj' \
  --exclude '*.pdb' \
  --exclude '*.ilk' \
  --exclude '*.backup-*' \
  "${RELEASE_ROOT}/" "${INSTALL_DIR}/"

chown -R "${APP_NAME}:${NGINX_USER}" "${INSTALL_DIR}"
find "${INSTALL_DIR}" -type d -exec chmod 0750 {} +
find "${INSTALL_DIR}" -type f -exec chmod 0640 {} +
[[ ! -e "${INSTALL_DIR}/rsa_private.pem" ]] || chmod 0600 "${INSTALL_DIR}/rsa_private.pem"
[[ ! -e "${INSTALL_DIR}/rsa_public.pem" ]] || chmod 0640 "${INSTALL_DIR}/rsa_public.pem"

log "install sandboxed JavaScript runner"
install -d -m 0755 -o root -g root /usr/local/libexec
install -d -m 0755 -o root -g root /usr/local/lib/license-mvp-script-runner
install -m 0755 -o root -g root \
  "${RELEASE_ROOT}/deploy/system/license-script-runner.wrapper" \
  /usr/local/libexec/license-script-runner
install -m 0755 -o root -g root \
  "${RELEASE_ROOT}/script_executor.mjs" \
  /usr/local/lib/license-mvp-script-runner/script_executor.mjs
install -m 0440 -o root -g root \
  "${RELEASE_ROOT}/deploy/system/license-script-runner.sudoers" \
  /etc/sudoers.d/license-script-runner

if command -v visudo >/dev/null 2>&1; then
  visudo -cf /etc/sudoers >/dev/null
fi

log "install Nginx configuration"
install -d -m 0755 /etc/nginx/conf.d /etc/nginx/sites-available
install -m 0644 -o root -g root \
  "${RELEASE_ROOT}/deploy/nginx/license-mvp-security.conf" \
  /etc/nginx/conf.d/license-mvp-security.conf
install -m 0600 -o root -g root \
  "${RELEASE_ROOT}/deploy/nginx/license-mvp" \
  /etc/nginx/sites-available/license-mvp
if [[ -d /etc/nginx/sites-enabled ]]; then
  ln -sfn /etc/nginx/sites-available/license-mvp /etc/nginx/sites-enabled/license-mvp
fi

log "validate PHP and Nginx"
php -l "${INSTALL_DIR}/index.php" >/dev/null
php -l "${INSTALL_DIR}/bootstrap.php" >/dev/null
nginx -t >/dev/null

log "reload ${FPM_SERVICE} and nginx"
systemctl enable "${FPM_SERVICE}" >/dev/null
systemctl reload "${FPM_SERVICE}"
systemctl enable nginx >/dev/null
systemctl reload nginx

cat > "${BACKUP_DIR}/release.json" <<EOF
{
  "app": "${APP_NAME}",
  "release_root": "${RELEASE_ROOT}",
  "install_dir": "${INSTALL_DIR}",
  "backup_dir": "${BACKUP_DIR}",
  "fpm_service": "${FPM_SERVICE}",
  "nginx_user": "${NGINX_USER}",
  "completed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "deployment complete; backup=${BACKUP_DIR}"
