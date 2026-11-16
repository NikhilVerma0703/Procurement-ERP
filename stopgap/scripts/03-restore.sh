#!/usr/bin/env bash
# ERPNext stopgap, step 3 of 3 — run as the `frappe` user inside WSL:
#   wsl -d Ubuntu-22.04 -u frappe --cd "<this repo>/stopgap" -- bash scripts/03-restore.sh [old-site-config.json] [backup-prefix]
#
# Restores an ERPNext backup (database + public + private files) from
# ../data/erpnext-backup into the stopgap site. With no prefix it takes the
# newest backup there — so the FINAL backup taken on the old site's last day is
# restored the same way: copy its three files into data/erpnext-backup and run
# this again (it replaces the site's data with the backup's).
#
# Afterwards the site is set up for safe use alongside the old one:
#   - outgoing email muted and the scheduler off (no notification goes to a
#     supplier from here by accident while the old site is still live);
#   - the old site's encryption key, when its site_config backup is given, so
#     saved passwords (email accounts, GST settings) still open;
#   - the Administrator password from stopgap/.env (users keep their own).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$HERE/.env"
set +a

BACKUP_DIR="$HERE/../data/erpnext-backup"
# Arguments in this order because Windows PowerShell drops an empty argument
# ("") on its way to wsl.exe: the usual call passes only the config file.
OLD_CONFIG="${1:-}"
BACKUP_PREFIX="${2:-}"
if [ -z "$BACKUP_PREFIX" ]; then
  BACKUP_PREFIX="$(basename "$(ls -1 "$BACKUP_DIR"/*-database.sql.gz | sort | tail -1)" -database.sql.gz)"
fi
for part in database.sql.gz files.tar private-files.tar; do
  [ -f "$BACKUP_DIR/$BACKUP_PREFIX-$part" ] || { echo "missing $BACKUP_DIR/$BACKUP_PREFIX-$part"; exit 1; }
done

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use 16 >/dev/null
export PATH="$HOME/.local/bin:$PATH"
cd "$HOME/frappe-bench"

# The bench's own Redis servers (cache, queue, socketio) are normally started
# by `bench start`. Run them for the restore only, then shut them down again so
# `bench start` can start its own on the same ports.
# (Not every bench version has all three config files: skip the missing ones.)
REDIS_CONFS=(config/redis_cache.conf config/redis_queue.conf config/redis_socketio.conf)
for conf in "${REDIS_CONFS[@]}"; do
  [ -f "$conf" ] || continue
  redis-server "$conf" --daemonize yes >/dev/null
done
stop_redis() {
  for conf in "${REDIS_CONFS[@]}"; do
    [ -f "$conf" ] || continue
    port="$(awk '/^port/ {print $2}' "$conf")"
    [ -n "$port" ] && redis-cli -p "$port" shutdown nosave >/dev/null 2>&1 || true
  done
}
trap stop_redis EXIT

# Work from Linux's own disk: much faster than reading /mnt/c.
WORK="$HOME/restore-work"
rm -rf "$WORK" && mkdir -p "$WORK"
cp "$BACKUP_DIR/$BACKUP_PREFIX-database.sql.gz" "$BACKUP_DIR/$BACKUP_PREFIX-files.tar" "$BACKUP_DIR/$BACKUP_PREFIX-private-files.tar" "$WORK/"

if [ ! -d "sites/$SITE_NAME" ]; then
  bench new-site "$SITE_NAME" --mariadb-root-password "$DB_ROOT_PASSWORD" --admin-password "$ADMIN_PASSWORD"
fi

bench --site "$SITE_NAME" restore "$WORK/$BACKUP_PREFIX-database.sql.gz" \
  --with-public-files "$WORK/$BACKUP_PREFIX-files.tar" \
  --with-private-files "$WORK/$BACKUP_PREFIX-private-files.tar" \
  --mariadb-root-password "$DB_ROOT_PASSWORD"

# The add-on's code is not here: take it off the site's app list and let its
# records load from the database (see pacific-group-workarounds.sql). Must run
# before migrate, which would otherwise drop its DocTypes as orphans.
yes | bench --site "$SITE_NAME" remove-from-installed-apps pacific_group || true
bench --site "$SITE_NAME" mariadb < "$HERE/scripts/pacific-group-workarounds.sql"

if [ -n "$OLD_CONFIG" ] && [ -f "$OLD_CONFIG" ]; then
  KEY="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["encryption_key"])' "$OLD_CONFIG")"
  bench --site "$SITE_NAME" set-config encryption_key "$KEY"
  unset KEY
fi
bench --site "$SITE_NAME" set-config mute_emails 1

bench --site "$SITE_NAME" migrate
bench --site "$SITE_NAME" set-admin-password "$ADMIN_PASSWORD"
bench --site "$SITE_NAME" disable-scheduler
bench use "$SITE_NAME"
bench --site "$SITE_NAME" clear-cache

rm -rf "$WORK"
echo "restored: $BACKUP_PREFIX into $SITE_NAME"
