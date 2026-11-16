#!/usr/bin/env bash
# ERPNext stopgap, step 2 of 3 — run as the `frappe` user inside WSL:
#   wsl -d Ubuntu-22.04 -u frappe --cd "<this repo>/stopgap" -- bash scripts/02-bench.sh
#
# The same software as the old site: Frappe 14 + ERPNext 14 + India Compliance
# 14 (their version-14 branches), on Node 16 as Frappe 14 requires. The custom
# pacific_group add-on is not available (its records are handled by
# pacific-group-workarounds.sql at restore time). Safe to run again.
set -euo pipefail

cd "$HOME"

# Node 16 + yarn, through nvm.
if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
  curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install 16 >/dev/null
nvm alias default 16 >/dev/null
nvm use 16 >/dev/null
command -v yarn >/dev/null || npm install -g yarn >/dev/null

# The bench command.
python3 -m pip install --user -q --upgrade frappe-bench
export PATH="$HOME/.local/bin:$PATH"
grep -q '.local/bin' "$HOME/.bashrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"

if [ ! -d "$HOME/frappe-bench" ]; then
  bench init --frappe-branch version-14 --python python3.10 frappe-bench
fi
cd "$HOME/frappe-bench"
[ -d apps/erpnext ] || bench get-app --branch version-14 erpnext
[ -d apps/india_compliance ] || bench get-app --branch version-14 https://github.com/resilient-tech/india-compliance

# No asset watcher: nothing here is being developed, and it costs memory.
sed -i '/^watch:/d' Procfile

echo "bench ready: $(bench version 2>/dev/null | tr '\n' ' ')"
