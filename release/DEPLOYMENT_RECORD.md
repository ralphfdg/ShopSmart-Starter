# ShopSmart Deployment Record (v1.1, hosted demo)

| Item | Value |
|---|---|
| Release | Hosted demo on AWS. Fictional data and simulated checkout only |
| Site URL | https://shopsmartbyralph.52-63-34-10.sslip.io |
| Code version | Git tag `v1.1.0` on branch `deployment` (from `main` after PR #5) |
| AWS account | Member account "ShopSmart-Demo" (ID ending 8097) in the team's AWS Organization |
| AWS plan | Paid plan (pay as you go). Usage is covered by shared organization credits: US$96.20 left of US$120 on 24 Nov 2026, expiring 5 Nov 2027. Evidence: H-00 (account and credit IDs redacted) |
| Region | ap-southeast-2 (Sydney). The organization's region policy allows workloads only here |
| Owner | Ralph De Guzman |
| Demo window | From 24 Nov 2026. Remove everything after grading (see "Removal plan") |

## Architecture decision record

**Decision:** one EC2 instance runs Caddy (HTTPS and static files), the Express API (systemd service) and PostgreSQL 16.

**Why:**
- The shop and the API share one HTTPS address. The sign-in cookie is then same-site (`HttpOnly; Secure; SameSite=Lax`), with no cross-site cookie problems and no CORS credentials across domains.
- Fewer services to configure and pay for than Amplify + EC2 + RDS. That fits a short classroom demo paid from credits.
- Caddy gets a free Let's Encrypt certificate automatically for the `sslip.io` hostname, so no domain purchase is needed.

**Trade-offs we accept:**
- One machine is a single point of failure. If it stops, the shop, API and database all stop.
- We maintain the operating system, PostgreSQL backups (`pg_dump`) and HTTPS ourselves.
- Data lives on the instance's disk. Deleting the instance deletes the data.

**Rejected alternative:** Amplify + EC2 + RDS. It shows each service's job more clearly, but the shop (`*.amplifyapp.com`) and the API would be on different sites. Browsers increasingly block cross-site cookies, and the API would still need its own HTTPS name. It also adds RDS cost.

## Deployment diagram

```
                Internet (fictional test customers)
                              |
                       HTTPS 443 / HTTP 80
                              |
   +---------- Security group shopsmart-web (only 80, 443 open) ----------+
   |  EC2 t3.micro, Amazon Linux 2023, Elastic IP 52.63.34.10             |
   |                                                                      |
   |  Caddy ---- /            --> /opt/shopsmart/frontend/dist (React)    |
   |        \--- /api/*       --> Express on 127.0.0.1:3000 (systemd)     |
   |                                     |                                |
   |                                     v                                |
   |                          PostgreSQL 16 on 127.0.0.1:5432             |
   |                                                                      |
   |  Admin access: AWS Session Manager (role shopsmart-ec2-ssm), no SSH  |
   +----------------------------------------------------------------------+
   Optional: Gemini (server-side only). Not configured: the assistant
   answers from the catalog and labels them "Catalog search (no AI used)".
```

| Port | Open to | Why |
|---|---|---|
| 443 | Anyone | The shop over HTTPS |
| 80 | Anyone | Let's Encrypt check, then Caddy redirects to HTTPS |
| 22 (SSH) | Nobody | Session Manager is used instead |
| 3000 (API) | Only the instance itself | Express listens on 127.0.0.1. Caddy is the only entry point |
| 5432 (PostgreSQL) | Only the instance itself | The browser never talks to the database |

## Resource register

| Service | Resource | Region | Purpose | Created | Planned removal |
|---|---|---|---|---|---|
| Organizations | Account ShopSmart-Demo | Global | Keeps the demo separate and easy to clean up | 24 Nov 2026 | After grading |
| IAM | Role + instance profile `shopsmart-ec2-ssm` (AmazonSSMManagedInstanceCore) | Global | Session Manager access without SSH | 24 Nov 2026 | With the instance |
| EC2 | Elastic IP 52.63.34.10 (`shopsmart-eip`) | ap-southeast-2 | Fixed address for the hostname and certificate | 24 Nov 2026 | Release after grading. Costs about US$0.12/day even when unused |
| EC2 | Security group `shopsmart-web` | ap-southeast-2 | Allows 80 and 443 only | 24 Nov 2026 | With the instance |
| EC2 | Instance `shopsmart-demo` (i-05eac18f87d72ef8a), t3.micro, Standard CPU credits | ap-southeast-2 | Runs Caddy, the API and PostgreSQL | 24 Nov 2026 | After grading |
| EBS | 20 GiB gp3, encrypted, deleted with the instance | ap-southeast-2 | System, app and database storage | 24 Nov 2026 | With the instance |

Estimated cost: about US$0.50/day (instance US$0.32, public IPv4 US$0.12, disk US$0.06), paid from credits. No credentials are recorded in this document.

## Secrets and settings

| Setting | Where | Public or secret |
|---|---|---|
| `DATABASE_URL`, test-customer passwords | `/etc/shopsmart/api.env` on the instance, root only (mode 600), generated on first boot | Secret, never in Git, screenshots or the browser |
| `GEMINI_API_KEY` | Same file, left empty | Secret |
| `VITE_API_URL=/api` | Built into the frontend | Public |
| `FRONTEND_URL`, `HOST=127.0.0.1`, `TRUST_PROXY=1`, `NODE_ENV=production` | Same file | Public |

## Database and data preservation

- Schema changes ship as committed Prisma migrations. The server only runs `prisma migrate deploy`, which never resets data.
- Migration history: `20260910103102_initial_schema`, then `20261124000000_add_users_sessions_order_owner`.
- The destructive `db:seed` ran once on the new, empty database during first boot. It now refuses to run in production unless `ALLOW_DESTRUCTIVE_SEED=yes` is set.
- `db:seed:customers` only creates or updates the two fictional customers, so it is safe to repeat.

## Hosted verification (24 Nov 2026, fresh Playwright browser, 1280 × 900)

Each expected result was written before the check ran. Evidence is in `release/evidence/hosted/`. No passwords appear in any screenshot.

| Guide check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| Frontend and direct route | `/cart` opened directly shows the app | App shown (Caddy sends unknown paths to index.html). `/orders/9` also 200 | Pass | H-01 |
| API connection | `/api/health/ready` over HTTPS reports the database | `{"status":"ok","database":"ok"}`. HTTP gets a 308 redirect to HTTPS | Pass | H-02 |
| Network exposure | Only 80 and 443 reachable | Ports 22, 3000 and 5432 closed from the internet | Pass | (port scan from tester PC) |
| Catalog and cart | Six products, cart total correct | Six products. Keyboard + Lamp = ₱2,750 | Pass | H-05, H-06 |
| Guest refused | `/orders` sends the guest to sign in. `/api/orders` returns 401, not cached | Redirected to `/login`. 401 `SIGN_IN_REQUIRED` with `Cache-Control: no-store` | Pass | H-03, H-04 |
| Owner succeeds | Customer One signs in, checks out, sees the order | Name and email filled in. Order **#1** ₱2,750.00 saved. Details page shows it | Pass | H-07, H-08, H-10 |
| Invalid or excess order refused | 20 webcams → 409. Bad email or quantity 0 → 422. Nothing saved | 409 `INSUFFICIENT_STOCK`, 422 `INVALID_ORDER` (field: email), 422 for quantity 0. Still one order. Stock: Keyboard 8→7, Lamp 10→9 | Pass | H-09 |
| Another customer denied | Customer Two has no orders. Order #1 page and `/api/orders/1` → not found | Empty list. "Order could not be found." API 404 `ORDER_NOT_FOUND` with no order data | Pass | H-11, H-12, H-13 |
| Assistant | Catalog-only answer is labelled. Product and price match the catalog. No match is honest | "Answer source: Catalog search (no AI used)". Compact Mechanical Keyboard ₱1,850, source #2. "Do you sell camping tents?" → honest no-match | Pass | H-14, H-15 |
| Restart and logs | After `systemctl reboot` the API returns without help. Data kept. Logs show no secrets | Back about 30 s later (boot 00:36:24 UTC). All three services active. 6 products, order #1 and both customers kept. Journal shows request lines only | Pass | H-16 |
| Secrets | No secret in the repository, built frontend or screenshots | Built `dist` has no secret strings. `git grep` finds only the `${db_password}` template variable. Screenshots show no passwords | Pass | H-16 |
| Credits | Usage stays within credits | US$96.20 of credits left before launch. Estimated US$0.50/day | Pass (check again before grading) | H-00 |

## Release note (v1.1, hosted)

**What's new since the local v1.0 release:**
- Customer sign-in with hashed passwords and HttpOnly session cookies. Checkout now requires sign-in.
- "My orders" and order details. The API returns only the signed-in customer's orders. Another customer's order gets 404, and a guest gets 401.
- `/api/health/ready` checks PostgreSQL. This fixes known limit L-02.
- Private account and order responses are sent with `Cache-Control: no-store`.
- The assistant labels whether an answer came from live AI or the catalog.
- `db:seed` refuses to run in production. A non-destructive `db:seed:customers` script was added.
- Hosting files in `deploy/`: Caddyfile, systemd service, settings template, first-boot setup script.

**The two improvements and their retests:**

| # | Improvement | Before | Retest after |
|---|---|---|---|
| 1 | Sign-in and order ownership | v1.0 known limit "No login": anyone could place an order, and orders could not be read back | 47 backend tests (guest 401, owner 200, other customer 404). Local browser test A1–S1 passed. Hosted checks H-03, H-04, H-08, H-10 to H-13 passed |
| 2 | Database readiness check | L-02: `/api/health` always said ok, even with the database down | Unit test returns 503 when the database is unreachable. Hosted `/api/health/ready` returns `database: ok` (H-02) and recovered after the reboot (H-16) |

**Known limits:**
- Live Gemini AI is off (no key on the server). The assistant answers from the catalog and says so.
- The cart is kept in memory and empties on a full page refresh (L-01).
- The `sslip.io` hostname depends on a public DNS service. Use only with instructor approval.
- Single instance: no automatic failover, and backups are manual (`pg_dump`).

## Removal plan

After grading, in the ShopSmart-Demo account (ap-southeast-2):
1. Terminate instance `shopsmart-demo`. Its encrypted disk is deleted with it.
2. Release Elastic IP 52.63.34.10.
3. Delete security group `shopsmart-web` and IAM role `shopsmart-ec2-ssm`.
4. Check EC2, EBS volumes and snapshots, and Elastic IPs in every allowed Region.
5. Optionally close the ShopSmart-Demo account from the management account.
