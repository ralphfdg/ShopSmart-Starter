#!/bin/bash
# First-boot setup for ShopSmart on one Amazon Linux 2023 EC2 instance (x86_64).
# Run as root from EC2 user data, after the repository is cloned to /opt/shopsmart:
#   SHOP_HOST=shopsmartbyralph.<ip-with-dashes>.sslip.io bash /opt/shopsmart/deploy/ec2-setup.sh
# The database and test-customer passwords are generated here and never leave this server.
# Progress log: /var/log/shopsmart-setup.log
set -euo pipefail
: "${SHOP_HOST:?Set SHOP_HOST to the shop hostname}"
export HOME=/root PATH=/usr/local/bin:$PATH
APP_DIR=/opt/shopsmart
NODE_MAJOR=22
step() { echo "=== [$(date -u +%H:%M:%S)] $*"; }

step "1/9 Swap file (npm install and the build need more than 1 GB of memory)"
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap defaults 0 0' >> /etc/fstab
fi

step "2/9 Operating system packages"
dnf install -y -q git tar xz openssl postgresql16 postgresql16-server

step "3/9 Node.js ${NODE_MAJOR} from nodejs.org, checked against its published SHA-256"
if ! node -v 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  cd /tmp
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  curl -fsSLO "$base/SHASUMS256.txt"
  file=$(grep -oE "node-v[0-9.]+-linux-x64\.tar\.xz" SHASUMS256.txt | head -1)
  curl -fsSLO "$base/$file"
  grep " ${file}\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "$file" -C /usr/local --strip-components=1
fi
node -v

step "4/9 Caddy from its official GitHub release, checked against its published SHA-512"
if ! command -v caddy >/dev/null; then
  cd /tmp
  version=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest | grep -oE '"tag_name": *"v[0-9.]+"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  file="caddy_${version}_linux_amd64.tar.gz"
  curl -fsSLO "https://github.com/caddyserver/caddy/releases/download/v${version}/${file}"
  curl -fsSLO "https://github.com/caddyserver/caddy/releases/download/v${version}/caddy_${version}_checksums.txt"
  grep " ${file}\$" "caddy_${version}_checksums.txt" | sha512sum -c -
  tar -xzf "$file" -C /usr/local/bin caddy
fi
caddy version
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy

step "5/9 PostgreSQL: local connections only, password login"
[ -f /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb
sed -i -E 's/^(host[[:space:]]+all[[:space:]]+all[[:space:]]+(127\.0\.0\.1\/32|::1\/128)[[:space:]]+)ident/\1scram-sha-256/' /var/lib/pgsql/data/pg_hba.conf
systemctl enable postgresql >/dev/null
systemctl restart postgresql

step "6/9 Server settings with generated secrets (/etc/shopsmart/api.env, root only)"
mkdir -p /etc/shopsmart
if [ ! -f /etc/shopsmart/api.env ]; then
  db_password=$(openssl rand -hex 24)
  sudo -u postgres psql -q -v ON_ERROR_STOP=1 \
    -c "CREATE USER shopsmart_app WITH PASSWORD '${db_password}';" \
    -c "CREATE DATABASE shopsmart OWNER shopsmart_app;"
  (
    umask 077
    cat > /etc/shopsmart/api.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
FRONTEND_URL=https://${SHOP_HOST}
TRUST_PROXY=1
DATABASE_URL=postgresql://shopsmart_app:${db_password}@127.0.0.1:5432/shopsmart?schema=public
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
TEST_CUSTOMER_ONE_PASSWORD=$(openssl rand -hex 12)
TEST_CUSTOMER_TWO_PASSWORD=$(openssl rand -hex 12)
EOF
  )
fi

step "7/9 Install, migrate, build"
id shopsmart >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$APP_DIR" --shell /sbin/nologin shopsmart
cd "$APP_DIR"
set -a; . /etc/shopsmart/api.env; set +a
npm ci --include=dev --no-audit --no-fund
npm run db:generate
npm run db:deploy
VITE_API_URL=/api npm run build

step "8/9 Sample products (first boot only) and test customers"
if [ ! -f /etc/shopsmart/.seeded ]; then
  ALLOW_DESTRUCTIVE_SEED=yes npm run db:seed
  touch /etc/shopsmart/.seeded
fi
npm run db:seed:customers

step "9/9 Services: API (systemd) and Caddy (HTTPS for ${SHOP_HOST})"
install -m 644 deploy/shopsmart-api.service /etc/systemd/system/shopsmart-api.service
mkdir -p /etc/caddy
sed "s/shop\.example\.com/${SHOP_HOST}/" deploy/Caddyfile > /etc/caddy/Caddyfile
cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy web server (HTTPS and static files for ShopSmart)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable shopsmart-api caddy >/dev/null
systemctl restart shopsmart-api caddy

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health/ready; then echo; step "Setup finished. Open https://${SHOP_HOST}"; exit 0; fi
  sleep 2
done
step "The API did not become ready. Check: journalctl -u shopsmart-api"
exit 1
