#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="license-mvp"
INSTALL_DIR="/opt/${APP_NAME}"
BACKUP_ROOT="/opt/${APP_NAME}-backups"
RELEASE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/release-${STAMP}"
ENV_DIR="/etc/${APP_NAME}"
ENV_FILE="${ENV_DIR}/${APP_NAME}.env"

log() { printf '[apply] %s\n' "$*"; }
die() { printf '[apply] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'printf "[apply] ERROR at line %s\n" "$LINENO" >&2' ERR

ensure_runtime_env() {
  install -d -m 0700 -o root -g root "${ENV_DIR}"
  if [[ ! -s "${ENV_FILE}" ]]; then
    local temporary
    umask 077
    temporary="$(mktemp "${ENV_DIR}/.${APP_NAME}.env.XXXXXX")"
    {
      printf 'APP_ENV=production\n'
      printf 'LICENSE_KEY_PEPPER=%s\n' "$(openssl rand -hex 32)"
      printf 'REQUEST_HMAC_SECRET=%s\n' "$(openssl rand -hex 32)"
      printf 'LICENSE_MANAGE_SECRET=%s\n' "$(openssl rand -hex 32)"
    } > "${temporary}"
    chown root:root "${temporary}"
    chmod 0600 "${temporary}"
    mv -f -- "${temporary}" "${ENV_FILE}"
    log "generated protected runtime secret file ${ENV_FILE}"
  fi
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
  [[ "${APP_ENV:-}" == "production" ]] || die "APP_ENV=production is required in ${ENV_FILE}"
  local name value
  for name in LICENSE_KEY_PEPPER REQUEST_HMAC_SECRET LICENSE_MANAGE_SECRET; do
    value="${!name:-}"
    [[ "${value}" =~ ^[A-Za-z0-9+/_=-]{32,}$ ]] || die "${name} is missing or too short in ${ENV_FILE}"
  done
}

[[ "${EUID}" -eq 0 ]] || die "run as root"
[[ -f "${RELEASE_ROOT}/index.php" ]] || die "index.php missing from release"
[[ -f "${RELEASE_ROOT}/bootstrap.php" ]] || die "bootstrap.php missing from release"
[[ -f "${RELEASE_ROOT}/deploy/migrate_runtime_secrets.php" ]] || die "runtime secret migration script missing"
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
FPM_DROPIN_DIR="/etc/systemd/system/${FPM_SERVICE}.service.d"
FPM_DROPIN="${FPM_DROPIN_DIR}/license-mvp-env.conf"
FPM_POOL_CONFIG="$(find /etc/php /etc/php-fpm.d -type f -name "${APP_NAME}.conf" -print -quit 2>/dev/null || true)"
[[ -n "${FPM_POOL_CONFIG}" ]] || die "PHP-FPM pool config not found: ${APP_NAME}.conf"
ensure_runtime_env

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
backup_path "${ENV_FILE}"
backup_path "${FPM_DROPIN}"
backup_path "${FPM_POOL_CONFIG}"

mkdir -p "${INSTALL_DIR}"
log "sync application source from ${RELEASE_ROOT}"
command -v rsync >/dev/null 2>&1 || die "rsync is required"
rsync -a \
  --exclude '.git/' \
  --exclude 'deploy/' \
  --exclude 'storage.sqlite*' \
  --exclude 'rsa_private.pem' \
  --exclude 'rsa_public.pem' \
  --exclude 'keys-backup/' --exclude 'admin-data.json' \
  --exclude 'php-runtime/' \
  --exclude 'node_modules/' \
  --exclude 'cpp_client/' \
  --exclude '*.obj' \
  --exclude '*.pdb' \
  --exclude '*.ilk' \
  --exclude '*.backup-*' \
  "${RELEASE_ROOT}/" "${INSTALL_DIR}/"
# Remove stale generated export left by older releases.
rm -f -- "$INSTALL_DIR/admin-data.json"

log "migrate runtime secrets"
if [[ -s "${INSTALL_DIR}/storage.sqlite" ]]; then
  LEGACY_LICENSE_KEY_PEPPER='change-this-development-pepper' \
  LEGACY_LICENSE_MANAGE_SECRET='change-this-management-secret-32chars' \
  php "${RELEASE_ROOT}/deploy/migrate_runtime_secrets.php" --db "${INSTALL_DIR}/storage.sqlite"
fi

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

log "install PHP-FPM runtime secret environment"
install -d -m 0755 "${FPM_DROPIN_DIR}"
cat > "${FPM_DROPIN}" <<EOF
[Service]
EnvironmentFile=${ENV_FILE}
EOF
chown root:root "${FPM_DROPIN}"
chmod 0644 "${FPM_DROPIN}"
if grep -Eq '^[[:space:]]*clear_env[[:space:]]*=' "${FPM_POOL_CONFIG}"; then
  sed -i -E 's/^[[:space:]]*clear_env[[:space:]]*=.*/clear_env = no/' "${FPM_POOL_CONFIG}"
else
  printf '\nclear_env = no\n' >> "${FPM_POOL_CONFIG}"
fi

log "validate PHP and Nginx"
php -l "${INSTALL_DIR}/index.php" >/dev/null
php -l "${INSTALL_DIR}/bootstrap.php" >/dev/null
nginx -t >/dev/null

log "reload ${FPM_SERVICE} and nginx"
systemctl enable "${FPM_SERVICE}" >/dev/null
systemctl daemon-reload
systemctl restart "${FPM_SERVICE}"
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
