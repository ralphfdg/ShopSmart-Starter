# Deploying ShopSmart on one EC2 host

Layout: the browser talks only to **Caddy** over HTTPS (port 443). Caddy serves the built React files and forwards `/api/*` to **Express** on `127.0.0.1:3000`. Express talks to **PostgreSQL** on `localhost:5432`. The shop and the API share one address, so the sign-in cookie is never cross-site.

```
Browser --HTTPS 443--> Caddy --+--> /opt/shopsmart/frontend/dist (static files)
                               +--> /api/* --> Express 127.0.0.1:3000 --> PostgreSQL localhost:5432
```

Use fictional data only. Checkout is simulated.

## Before you start

- Check the account plan, credits and expiry in Billing and Cost Management. Set a budget alert.
- Record every resource (service, Region, owner, purpose, created, planned removal) in a resource register.
- Choose a hostname for HTTPS: a domain you control, or `<elastic-ip>.sslip.io` if your instructor approves it.

## Security group

| Port | Source | Why |
|---|---|---|
| 443 | Anywhere | The shop over HTTPS |
| 80 | Anywhere | Certificate check and redirect to HTTPS |
| 22 | Your IP only, or closed if you use Session Manager | Administration |
| 3000, 5432 | **Never open** | Internal only |

## Automatic setup (recommended)

`deploy/ec2-setup.sh` does every step below on first boot. Paste this as the instance's **User data** when launching, with the Elastic IP written using dashes:

```bash
#!/bin/bash
dnf install -y git
git clone --branch deployment https://github.com/ralphfdg/ShopSmart-Starter.git /opt/shopsmart
SHOP_HOST=shopsmartbyralph.<ip-with-dashes>.sslip.io bash /opt/shopsmart/deploy/ec2-setup.sh >> /var/log/shopsmart-setup.log 2>&1
```

Follow progress in Session Manager with `sudo tail -f /var/log/shopsmart-setup.log`. The generated test-customer passwords are in `/etc/shopsmart/api.env` (root only).

## Server setup by hand (once)

1. Launch an Amazon Linux 2023 instance with an Elastic IP. Point the hostname at the Elastic IP.
2. Install Node.js 22, PostgreSQL and Caddy. Use each project's official instructions for Amazon Linux 2023.
3. Create a `shopsmart` system user. Clone the repository to `/opt/shopsmart` at the release tag.
4. In PostgreSQL, create a database `shopsmart` and a user `shopsmart_app` with a long random password.
5. Copy `deploy/api.env.example` to `/etc/shopsmart/api.env`, fill it in, then `sudo chmod 600 /etc/shopsmart/api.env`.

## Build and release (every release)

Run these as root (`sudo -i`), because `/etc/shopsmart/api.env` is readable only by root. Load the server settings into the shell first, so Prisma and the scripts see them:

```bash
cd /opt/shopsmart
set -a; source /etc/shopsmart/api.env; set +a
npm ci
npm run db:generate
npm run db:deploy          # applies committed migrations only; never resets data
VITE_API_URL=/api npm run build
sudo systemctl restart shopsmart-api
```

First release only, on a new empty database:

```bash
ALLOW_DESTRUCTIVE_SEED=yes npm run db:seed   # deletes all orders and products, then adds the sample products
npm run db:seed:customers                    # safe to repeat; creates the two fictional customers
```

Never run `db:seed` again after real test orders exist. Without `ALLOW_DESTRUCTIVE_SEED=yes` it refuses to run in production.

Then install the service and Caddy config:

```bash
sudo cp deploy/shopsmart-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now shopsmart-api
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile    # after replacing shop.example.com
sudo systemctl reload caddy
```

## Quick checks

- `https://<host>/api/health` returns `{"status":"ok"}`. The API process answers.
- `https://<host>/api/health/ready` returns `{"status":"ok","database":"ok"}`. PostgreSQL is reachable.
- `https://<host>/orders` after a refresh still shows the app.
- `sudo reboot`, then repeat the two health checks. The API starts by itself.
- `sudo journalctl -u shopsmart-api` shows request lines and trace IDs, with no passwords or keys.

## Backup and removal

- Backup: `pg_dump shopsmart > shopsmart-$(date +%F).sql`. Data on the instance is lost when the instance and its volume are deleted.
- After the demo: terminate the instance, delete its EBS volume and snapshots, release the Elastic IP, and delete the security group. Then check every Region in the resource register.
