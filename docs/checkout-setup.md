# Ebook Distribution — Setup & Operations

The Human Paradox distributes **Your Mind Is Not Your Enemy** in one of two
modes, chosen by a single server environment variable. Both modes deliver a
private PDF over signed, time-limited links.

## 0. Distribution mode (read this first)

`DISTRIBUTION_MODE` is read **only** on the server. The browser cannot select
or override it.

| Value | Behaviour |
|---|---|
| `FREE` (default when unset or unrecognized) | Free claim flow: one email form ("Get Your Free Copy" → "Send Me the Free Ebook") → confirmation page with a "Download Your Ebook" button (Google Drive, new tab) plus the emailed link. **No payment order is created, required, or simulated.** |
| `PAID` | Razorpay checkout at the server price (₹49 / 4900 paise INR), signature + gateway verification, webhook reconciliation, paid fulfillment. |

Safety properties:

- In `FREE` mode, `/api/checkout/create-order` and `/api/checkout/verify`
  return 404 — a free claim can never create or trigger paid logic.
- In `PAID` mode, `/api/free/claim` returns 404.
- Defaulting to `FREE` means a missing/misspelled variable can never
  accidentally take real payments.

**To switch back to paid:** set `DISTRIBUTION_MODE=PAID` (plus the Razorpay
variables below) and redeploy. Nothing else changes; the paid code path is
never deleted. **To go back to free:** set `DISTRIBUTION_MODE=FREE`.

## 1. Environment variables

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Server-side gateway credentials. Test keys start `rzp_test_`, live keys `rzp_live_`. The key type selects **test vs live mode** automatically (returned as `testMode` by create-order). |
| `RAZORPAY_WEBHOOK_SECRET` | From Razorpay Dashboard → Settings → Webhooks, for the endpoint below. |
| `DISTRIBUTION_MODE` | `FREE` (default) or `PAID`. See section 0. |
| `ORDERS_DB_PATH` | Default `./data/orders.json` (git-ignored). Used in PAID mode. |
| `FREE_CLAIMS_DB_PATH` | Default `./data/free-claims.json` (git-ignored). Used in FREE mode. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | **Required on Vercel.** Durable KV (Upstash Redis / Vercel KV REST). Without it, records are written to the local filesystem, which is ephemeral on serverless and will lose data across cold starts and deployments. |
| `EBOOK_PDF_PATH` | Default `./private/ebook.pdf`. Local-file fallback only. |
| `EBOOK_PDF_URL` / `EBOOK_PDF_TOKEN` | Preferred on Vercel: a private object-storage URL the server fetches at download time. Keeps the PDF out of the repo/bundle and off any public path. |
| `FREE_LINK_TTL_HOURS` / `FREE_EMAIL_COOLDOWN_MINUTES` / `FREE_MAX_EMAILS_PER_DAY` / `FREE_MAX_DOWNLOADS_PER_CLAIM` | FREE-mode delivery limits. Defaults 72 / 10 / 3 / 10. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `EMAIL_FROM` | Brevo SMTP sending. Requires a Brevo account, SMTP credentials, and a **verified sender** (email address or domain). Port 587 uses STARTTLS; port 465 uses implicit TLS. |
| `APP_BASE_URL` | Public URL used to build download links, e.g. `https://yourdomain.com`. |
| `DOWNLOAD_TOKEN_SECRET` | Random 32+ byte secret for signing download/receipt tokens. |
| `DOWNLOAD_LINK_TTL_HOURS` / `MAX_DOWNLOADS_PER_ORDER` | Defaults 72 / 5. |

## 2. Razorpay setup
1. Create a Razorpay account and complete KYC (required for live payments).
2. **Test mode:** Dashboard → Test Mode → Keys → generate `rzp_test_*` key pair. Enable desired payment methods (UPI, cards, netbanking) for test mode.
3. **Live mode:** complete activation, then use `rzp_live_*` keys.
4. Webhook: Dashboard → Settings → Webhooks → Add webhook:
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed` (add `refund.processed` for visibility)
   - Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
5. Test payments: Razorpay provides test cards/UPI in test mode — no real money moves. Never run a real payment to “test” without explicit approval.

## 3. Brevo SMTP email setup

1. Create a Brevo account and verify your sender: Brevo → Senders, verify the
   exact email address (or authenticate the whole domain) you will put in
   `EMAIL_FROM`. Unverified senders are rejected at delivery time.
2. Get SMTP credentials: Brevo → SMTP & API → SMTP. Use host
   `smtp-relay.brevo.com`, port `587` (STARTTLS, recommended) or `465`
   (implicit TLS), your SMTP login as `SMTP_USER`, and the generated SMTP key
   (or master password for older accounts) as `SMTP_PASSWORD`.
3. Set `EMAIL_FROM` to an address like `The Human Paradox <hello@yourdomain.com>`
   using the verified sender. Keep `SMTP_PASSWORD` in `.env.local` / Vercel
   environment variables only — never in code, logs, or screenshots.
4. The app verifies the SMTP connection (`verify()`) before every send and
   classifies failures as auth (`EMAIL_AUTH_FAILED`), connection
   (`EMAIL_CONNECTION_FAILED`), or delivery (`EMAIL_SEND_FAILED`) errors.
   Any failure is recorded on the order and the purchase stays valid — the
   customer can request a fresh link from the checkout page once SMTP works.
5. Actual delivery can only be proven with real SMTP credentials: after
   configuring them, run one test-mode purchase and confirm the email
   arrives (check Brevo → Statistics/Logs if it does not).

## 4. Ebook file

Export the final PDF and save it at `EBOOK_PDF_PATH` on the server. It is
streamed only through `/api/download/[token]` after paid-order verification.
`private/*.pdf` and `data/` are git-ignored. PDF sharing after purchase cannot
be technically prevented — the link policy (72h, 5 downloads) limits casual
spread.

## 6. Storage notes (important for Vercel)

**The local filesystem is not durable on Vercel.** Serverless function bundles
are read-only and replaced on every deployment, so anything written to
`./data/` or read from `./private/` will disappear between invocations.

Before deploying, configure durable storage:

1. **Records (required):** create an Upstash Redis or Vercel KV store and set
   `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Free claims and paid orders are then
   stored in that durable KV instead of local JSON.
   - FREE mode: `src/lib/free-claims.ts` (atomic `SET NX` create prevents
     duplicate claims).
   - PAID mode: `src/lib/orders.ts` still uses the file store — for paid mode on
     serverless, also migrate `OrderStore` to Postgres as described below.
2. **PDF (required):** upload the ebook to private object storage (S3, R2,
   Cloudflare R2, or any authenticated endpoint) and set `EBOOK_PDF_URL`
   (plus `EBOOK_PDF_TOKEN` if your storage requires a bearer token). The server
   fetches it only when serving an authorized download. Never place the PDF in
   `public/` or commit it.

Local JSON/file stores remain the development default and are fine for local
testing.

For PAID mode at scale, implement the `OrderStore` interface in
`src/lib/orders.ts` against Postgres (`pg` + a table matching the `Order`
shape) and swap `getStore()` in `src/lib/http.ts`. Suggested table:
`orders(id PK, data JSONB, gateway_order_id UNIQUE, ...)`. No database
migration has been applied — there is no database yet.

## 6. Free delivery (Google Drive)

In FREE mode the ebook is delivered as a **Google Drive share link**, so no
file needs to exist in the deployment.

1. Upload the finished ebook to Google Drive.
2. Share it: **Anyone with the link → Viewer** (this is what makes the link
   openable by visitors).
3. Copy the link — it must look like
   `https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing` — and set:

   ```bash
   EBOOK_DRIVE_URL=https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
   ```

The link is validated server-side: only `https` `drive.google.com` URLs with a
file id are accepted. If it is missing or invalid, `/api/free/claim` returns
`503 EBOOK_UNAVAILABLE`, **no email is sent**, and the checkout page shows a
configuration notice rather than a broken button.

### What this changes about security

- The link is **public**: anyone who has it can download the ebook, and it
  cannot be revoked per customer or protected from re-sharing. We ask readers
  not to re-share it, but we cannot enforce that.
- Per-customer, expiring, token-protected downloads are **no longer used for
  free delivery**. The signed receipt token still authorizes the claim-status
  lookup only — it does not gate the file.
- Abuse controls that remain: server-side email validation, 5 claims/minute per
  IP, one claim per email address, email cooldown, and a per-address daily
  email cap.
- PAID mode is untouched and still uses the protected `/api/download/<token>`
  endpoint with `EBOOK_PDF_PATH` / `EBOOK_PDF_URL`.

## 6a. Troubleshooting ebook delivery (`/api/health`)

`GET /api/health` returns deployment readiness as booleans only — no secrets,
no customer data, no tokens:

```json
{ "distributionMode": "FREE", "checks": {
  "tokenSigningConfigured": true, "smtpConfigured": true,
  "ebookAvailable": true, "ebookSource": "remote",
  "durableClaimStorage": true, "appBaseUrlConfigured": true } }
```

Symptom → cause → fix:

| Symptom | Cause | Fix |
|---|---|---|
| Claim returns `503 DELIVERY_UNAVAILABLE` | `DOWNLOAD_TOKEN_SECRET` missing | Set it (32+ random bytes) |
| Claim returns `503 EBOOK_UNAVAILABLE` | `EBOOK_DRIVE_URL` missing or not a valid Drive link | Set `EBOOK_DRIVE_URL` (see section 6) and ensure the Drive file is shared "Anyone with the link" |
| Email arrives but the Drive link won't open | Drive file is not shared publicly | Drive → Share → Anyone with the link → Viewer |
| Emailed link points at `localhost` | `APP_BASE_URL` unset | Set `APP_BASE_URL=https://your-domain` |
| Claims vanish after a deploy | No durable storage | Set `KV_REST_API_URL` + `KV_REST_API_TOKEN` |
| Claim returns `503 CLAIM_STORAGE_UNAVAILABLE` | Claims cannot be persisted (read-only filesystem on Vercel with no KV) | Set `KV_REST_API_URL` + `KV_REST_API_TOKEN`; confirm `claimStorageUsable: true` in `/api/health` |
| Checkout says "download link has not been configured" | `EBOOK_DRIVE_URL` unset/invalid | Set it (FREE mode) |

Claims **fail closed by design**: if the delivery link is missing or invalid, no
receipt is minted and no email is sent, so nobody receives a dead link.

In FREE mode `ebookAvailable` / `ebookSource` report `null` — they describe the
PAID-mode PDF sources and are irrelevant to Google Drive delivery. Use
`driveLinkConfigured` for FREE and `ebookDelivery` to see which mechanism is
active.

## 7. Test the free ebook claim

```bash
# .env.local
DISTRIBUTION_MODE=FREE
DOWNLOAD_TOKEN_SECRET=<random 32+ bytes>
APP_BASE_URL=http://localhost:3000
EBOOK_DRIVE_URL=https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
SMTP_HOST=smtp-relay.brevo.com          # optional: without it the download
SMTP_PORT=587                           # button still works, email does not
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM="The Human Paradox <hello@yourdomain.com>"
```

```bash
npm run dev
```

1. Open `http://localhost:3000/checkout` → "Get Your Free Copy", then click "Send Me the Free Ebook". The checkout page has a single email form; to request a fresh link later, submit the same address again.
2. Enter an invalid email → inline validation, no request sent.
3. Enter a valid email → redirected to `/free/success` with a working
   "Download Your Ebook" button.
4. With SMTP configured, confirm the email arrives (Brevo → logs). Without it,
   the page says the email could not be sent and the download still works.
5. Submit the same address again → same claim/token, and no second email
   within the cooldown window (rate limit returns 429 after repeated hits).

## 8. Test a paid purchase (PAID mode, test mode)

1. Set `rzp_test_*` keys + webhook secret + `DOWNLOAD_TOKEN_SECRET` + `APP_BASE_URL=http://localhost:3000`, place any PDF at `./private/ebook.pdf`.
2. `npm run dev`, open `/checkout`, enter your email, pay with a Razorpay test card.
3. Expect: redirect to `/checkout/success` showing “Your purchase is confirmed”, a working Download button, and (with Brevo SMTP configured) an email with the link.
4. Refresh the success page: no duplicate order, same download token.
5. Webhook retries are deduped by event id; email outage never invalidates payment (use “Get a fresh download link” to recover).

## 9. Remaining work before live launch

- [ ] Decide `DISTRIBUTION_MODE` for launch (FREE is the safe default).
- [ ] **Durable storage on Vercel:** `KV_REST_API_URL` + `KV_REST_API_TOKEN`
      configured; otherwise free claims cannot be saved at all
      (503 CLAIM_STORAGE_UNAVAILABLE) and would be lost on redeploy.
- [ ] FREE mode: `EBOOK_DRIVE_URL` set to a Drive file shared
      "Anyone with the link", and `DOWNLOAD_TOKEN_SECRET` + `APP_BASE_URL`
      set. No local PDF is required in the deployment.
- [ ] Brevo account + verified sender; SMTP credentials and `EMAIL_FROM` set;
      one real test email received (delivery is not otherwise verifiable).
- [ ] `APP_BASE_URL` set to the production domain; HTTPS.
- [ ] Strong unique `DOWNLOAD_TOKEN_SECRET` in production env.
- [ ] PAID mode only: real Razorpay account, KYC, live `rzp_live_*` keys,
      live webhook + secret, durable order storage, and a test-mode purchase
      end-to-end before switching `DISTRIBUTION_MODE=PAID`.
- [ ] Strong unique `DOWNLOAD_TOKEN_SECRET` in production env.
- [ ] Persistent volume for `ORDERS_DB_PATH` (or Postgres migration for scale-out).
- [ ] One end-to-end test-mode purchase, then one low-value live purchase.
