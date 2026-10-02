# Kotha WiFi Admin

Google-Sheet-free operations dashboard for voucher stock, Cashfree payments, plan catalog, accounting imports and Jio cost allocation. Built with Next.js and PostgreSQL for Vercel-compatible deployment.

## Included

- Admin sign-in, using a bcrypt password hash and an HTTP-only signed session cookie.
- Database-backed throttling for repeated failed admin sign-ins and excessive checkout creation for one phone number.
- PostgreSQL schema for plans, voucher stock, payment intents/payments, accounting sessions and Jio bills.
- Voucher import from one-code-per-line TXT or CSV (`username,password,code`). Password values are encrypted with AES-256-GCM using a key derived from `SESSION_SECRET`.
- Public `/buy` plan page and Cashfree hosted-checkout order creation. After a successful payment, the page checks for the allocated voucher, displays it and automatically downloads a PDF with a manual download fallback.
- Cashfree webhook HMAC verification using the raw request, payment amount/order matching, transaction locking, unique constraints and retry-safe allocation. The buyer return page also checks Cashfree's order payments server-to-server and fulfills a verified success if the webhook is delayed or missed.
- Recovery for the legacy uppercase `KW_...` return URL: it verifies the order directly with Cashfree, requires the order's stored return URL to point back to Kotha WiFi, and only links it to exactly one active plan with the same amount.
- Manual fulfillment of paid orders that arrived while their plan had no unused stock.
- RADIUS/MikroTik accounting CSV import and a dashboard that converts byte counters into decimal GB.
- Jio bill input and an estimated usage-based Jio cost allocation. Access cost per sale is entered on each plan.
- Plan metadata for FreeIsp plan ID, router ID, realm, validity, quota and simultaneous users.

## Run locally

Requires Node.js 20.9 or later and a PostgreSQL database. Create a blank database, copy `.env.example` to `.env.local`, and fill in:

- `DATABASE_URL`
- `SESSION_SECRET` with at least 32 random characters. Changing it invalidates sessions and makes previously encrypted voucher passwords unreadable.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 10 characters). The first login creates this admin. Changing these variables later does not rotate the stored password; update the `admins` row through a secure database procedure.
- `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`, and an explicit `CASHFREE_ENV` (`sandbox` or `production`) before enabling checkout.

Then run:

```sh
npm install
npm run db:migrate
npm run dev
```

`db:migrate` also inserts the eight known paid/trial plans from the existing catalogue if no active plan at each price already exists. The ₹5 1GB pack shown on the legacy homepage is intentionally not seeded because there is no matching stock in the supplied voucher workbook. Do not enable that pack until its exact voucher inventory is available.

Open `http://localhost:3000` for admin and `http://localhost:3000/buy` for the customer plan page. Configure the Cashfree webhook URL as `https://YOUR_DOMAIN/api/payments/webhook` and subscribe to `PAYMENT_SUCCESS_WEBHOOK`. Start in Cashfree sandbox mode. The checkout API uses Cashfree API version `2025-01-01` by default; set `CASHFREE_API_VERSION` if your account's configured version differs.

## Vercel / GitHub deployment

This dashboard source is in the `admin-dashboard/` subfolder of the existing public `ashishawachar93-digital/kothawifi` repository. The static homepage is at the repository root. The homepage's purchase buttons send customers to the dashboard's `/buy` page, which creates orders, verifies payment through Cashfree's webhook, allocates one imported voucher, and downloads the voucher PDF. To deploy the dashboard separately, import that repository into Vercel and set the Vercel project's **Root Directory** to `admin-dashboard`. The homepage and checkout therefore use separate hosts until a custom domain is assigned to the dashboard.

Attach a managed PostgreSQL database and set the variables in `.env.example` in the `kotha-wifi-admin` Vercel project's Production environment. Run `npm run db:migrate` against the production database once; this creates the schema and seeds the known plans. Import the private workbook voucher CSVs through the admin page after migration. Do not add voucher CSVs or database/payment secrets to GitHub. Set `APP_URL` to the deployed HTTPS origin. Add the exact deployed webhook URL in Cashfree and copy that endpoint's webhook signing secret into `CASHFREE_WEBHOOK_SECRET`. Keep all API/database/session secrets server-side; never use a `NEXT_PUBLIC_` prefix for them.

For a one-time migration from a linked checkout, pull the production variables into the ignored local file and run the migration from this folder:

```sh
vercel env pull .env.local --environment=production
npm run db:migrate
```

Do not commit `.env.local`. The migration script reads that file directly so the database URL does not have to be copied into a shell command.

## Voucher and accounting formats

Voucher CSV example:

```csv
username,password,code
guest001,p@ss-001,
guest002,p@ss-002,
```

Voucher TXT format: one username/code per line; passwords are blank. Pick the plan that matches the imported stock. Usernames are globally unique in the database to prevent the same network account from being sold under multiple plans.

Accounting CSV headers:

```csv
username,session_id,started_at,ended_at,input_bytes,output_bytes,router_id,realm
guest001,session-abc,2026-10-02T09:00:00Z,2026-10-02T10:00:00Z,104857600,209715200,router-west,default
```

Convert RADIUS `Acct-Input-Octets`/`Acct-Output-Octets` and the corresponding Gigawords fields to total bytes before import:
`bytes = Gigawords * 4,294,967,296 + Octets`. If your FreeIsp export already provides byte totals, import those directly. Re-importing the same router/session updates the counter totals instead of counting the session twice.

## MikroTik and FreeIspRadius integration boundary

The project currently stores the relevant plan/voucher mapping fields and imported accounting records. It does **not** call FreeIspRadius or RouterOS APIs, create/enable a RADIUS account, apply validity/quota/simultaneous-use attributes, select or assign a router/realm in FreeIsp, disconnect sessions, or synchronize live accounting. For now, payment allocates a pre-imported voucher from this database; the operator must ensure that voucher corresponds to an available credential in the network system.

Do not switch live traffic until the exact FreeIsp version/API or supported export format, authentication method, identifier semantics, RouterOS version, router/realm names, and voucher lifecycle have been confirmed. Implement a provider adapter only after those details are known. Verify which field FreeIsp expects when a voucher is a single code versus a username/password pair; configure validity start (on sale vs first login), quota units, simultaneous sessions, and expiration behavior to match.

## Financial calculation and limits

The dashboard's monthly estimated profit is collected successful sales minus the plan cost recorded for allocated vouchers minus Jio bill cost allocated in proportion to imported GB versus the bill's entered total GB (capped at 100%). It is not an audited profit figure. It excludes any costs not entered in the system, and requires a correct, complete accounting export and matching bill period. For overlapping Jio bill entries, the current view sums matching bill records, so avoid entering duplicate periods.

Cashfree success received when stock is empty is recorded as `SUCCESS_NO_STOCK`; import the matching plan stock and use **Allocate newly imported stock to paid orders**. Refunds, payment reversals, SMS/email voucher delivery, background reconciliation for buyers who never return to the site, and live stock disablement in FreeIsp are not implemented.

## Operational security

Use HTTPS, a private Postgres network, backups, restricted database credentials and a strong unique session secret. Voucher passwords are encrypted in the application before storage, while usernames and one-field codes remain searchable text. Do not log customer secrets. Rotate `SESSION_SECRET` only with a planned credential re-encryption/migration because old encrypted values cannot be decrypted with a new key.

