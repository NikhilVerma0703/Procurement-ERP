#!/usr/bin/env bash
# ERPNext stopgap, step 1 of 3 — run as root inside WSL Ubuntu 22.04:
#   wsl -d Ubuntu-22.04 -u root --cd "<this repo>/stopgap" -- bash scripts/01-system.sh
#
# System packages for Frappe 14 / ERPNext 14 (Python 3.10 is Ubuntu 22.04's
# own), MariaDB configured the way Frappe needs it (utf8mb4), wkhtmltopdf with
# patched Qt for the PDF printouts, and the `frappe` user the bench runs as.
# Safe to run again.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$HERE/.env"
set +a

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  git curl ca-certificates build-essential pkg-config software-properties-common \
  python3-dev python3-pip python3-venv python3.10-venv \
  mariadb-server mariadb-client redis-server \
  xvfb libfontconfig1 fontconfig xfonts-75dpi xfonts-base cron >/dev/null

# The bench starts its own Redis servers (Procfile); the system one is not used.
systemctl disable --now redis-server >/dev/null 2>&1 || true

# wkhtmltopdf 0.12.6.1 with patched Qt — Frappe's PDF engine.
if ! wkhtmltopdf --version 2>/dev/null | grep -q "patched qt"; then
  curl -fsSL -o /tmp/wkhtmltox.deb \
    https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/wkhtmltox_0.12.6.1-2.jammy_amd64.deb
  apt-get install -y -qq /tmp/wkhtmltox.deb >/dev/null
  rm -f /tmp/wkhtmltox.deb
fi

# MariaDB as Frappe expects it.
cat > /etc/mysql/mariadb.conf.d/99-frappe.cnf <<'CNF'
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

[mysql]
default-character-set = utf8mb4
CNF
systemctl enable mariadb >/dev/null 2>&1
systemctl restart mariadb

# Root may log in with the stopgap's password (bench needs it to create the
# site's database) and, as before, through the root account's socket.
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('${DB_ROOT_PASSWORD}') OR unix_socket; FLUSH PRIVILEGES;"

id frappe >/dev/null 2>&1 || useradd -m -s /bin/bash frappe

echo "system ready: $(mariadb --version | cut -d, -f1) · $(python3 --version) · $(wkhtmltopdf --version)"
