# ShopSmart-Starter

PDC50 ShopSmart web app built with React (Vite), Express, PostgreSQL (Prisma 6) and a Gemini product assistant.
Purchases are **simulated**. Only use fictional customer details.

## What you need

- Node.js 22 (at least 20.19). See `.nvmrc`.
- PostgreSQL running on `localhost:5432`.
- Optional: a Gemini API key from Google AI Studio. Without one, the assistant answers from the catalog.

## Start the app (first time)

Run every command from the project root folder.

1. Create the database user and database. Open `psql` as an admin user and run the following. The user needs `CREATEDB` because `prisma migrate dev` creates a temporary database.

   ```sql
   CREATE USER shopsmart_user WITH PASSWORD 'shopsmart_dev' CREATEDB;
   CREATE DATABASE shopsmart OWNER shopsmart_user;
   ```

2. Install the packages:

   ```bash
   npm install
   ```

3. Create the settings files. Then add your Gemini key to `backend/.env` if you have one. Never commit `.env` files.

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

4. Create the tables:

   ```bash
   npm run db:migrate
   ```

5. Add the sample products. **Warning:** this deletes all orders and products, so only run it on a new or disposable database.

   ```bash
   npm run db:seed
   ```

   Then create the two fictional test customers. First set `TEST_CUSTOMER_ONE_PASSWORD` and `TEST_CUSTOMER_TWO_PASSWORD` in `backend/.env` (at least 12 characters each). This command never deletes anything.

   ```bash
   npm run db:seed:customers
   ```

6. Start the frontend and the API together:

   ```bash
   npm run dev
   ```

7. Open these two addresses:
   - Shop: http://localhost:5173
   - API health check: http://localhost:3000/api/health (should show `{"status":"ok"}`)
   - Database check: http://localhost:3000/api/health/ready (should show `{"status":"ok","database":"ok"}`)

Sign in as `test.customer.one@example.com` or `test.customer.two@example.com` to check out and see **My orders**. Each customer can only see their own orders.

On later runs, only step 6 is needed.

If the shop opens on port 5174 instead of 5173, the API will block it, because CORS only allows `FRONTEND_URL`. Close whatever is using port 5173, or change `FRONTEND_URL` in `backend/.env` to the port Vite shows, then restart.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the frontend (5173) and the API (3000) |
| `npm run check` | Lint, all tests, and the frontend build |
| `npm test` | Frontend and backend tests only |
| `npm run db:migrate` | Local development only: applies and creates migrations (`prisma migrate dev`) |
| `npm run db:deploy` | Staging or production: applies committed migrations only, never resets data (`prisma migrate deploy`) |
| `npm run db:seed` | Deletes **all** orders and products, then adds the 6 sample products. Refuses to run when `NODE_ENV=production` |
| `npm run db:seed:customers` | Creates or updates the two fictional test customers. Never deletes anything |
| `npm run db:studio` | Opens Prisma Studio to view the data |

## Settings

| File | Setting | Public or secret |
|---|---|---|
| `frontend/.env` | `VITE_API_URL`: API address, for example `http://localhost:3000/api` | Public. It is built into the browser files. |
| `backend/.env` | `DATABASE_URL` | **Secret** |
| `backend/.env` | `GEMINI_API_KEY` | **Secret** |
| `backend/.env` | `FRONTEND_URL`: the only website allowed by CORS | Public |
| `backend/.env` | `TRUST_PROXY`: set to `1` only when the API is hosted behind a proxy | Public |
| `backend/.env` | `NODE_ENV`: `production` when hosted. Makes the sign-in cookie HTTPS-only and blocks `db:seed` | Public |
| `backend/.env` | `HOST`: set to `127.0.0.1` when hosted, so only the web server can reach the API | Public |
| `backend/.env` | `TEST_CUSTOMER_ONE_PASSWORD`, `TEST_CUSTOMER_TWO_PASSWORD`: fictional test accounts | **Secret** |

If `VITE_API_URL` is empty, a production build calls `/api` on the shop's own address.

## API routes

| Route | Who can use it |
|---|---|
| `GET /api/health`, `GET /api/health/ready` | Anyone |
| `GET /api/products`, `GET /api/products/:id`, `POST /api/assistant/questions` | Anyone |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Anyone |
| `POST /api/orders` | Signed-in customers. The order is saved under their account |
| `GET /api/orders`, `GET /api/orders/:id` | Signed-in customers, **own orders only**. Guests get 401, and another customer's order gets 404 |

## Hosting

See [deploy/README.md](deploy/README.md) for the single EC2 setup: Caddy (HTTPS and static files), a systemd service for the API, and PostgreSQL.

## Release documents

The test record, deployment plan and release note are in `release/ShopSmart_Release_Plan.docx`. Test evidence (screenshots and logs) is in `release/evidence/`.
