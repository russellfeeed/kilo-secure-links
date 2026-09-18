# SecureLinks — Phase 1 Pilot Foundation

SecureLinks is a secure document delivery service: a healthcare provider (or its orchestration engine, Prism) uploads a patient's PDF letter with metadata including the patient's date of birth and a retention expiry date; the service stores the document encrypted, validates the metadata, and returns a short, non-guessable access link (~61 characters, safe for a single SMS segment) that the provider's SMS system sends to the patient. When the patient opens the link, they must correctly enter their date of birth — with attempts limited and lockouts after repeated failures — before the document is revealed. Every step (upload, access attempts, verification successes and failures, lockouts and resets) is written to an immutable audit trail, queryable through a reporting API for delivery and governance metrics. SecureLinks deliberately does not send SMS itself or decide clinical routing (consent codes, physical-letter fallback); those remain upstream responsibilities — the application's job is to make the stored document reachable by exactly one verified recipient and nothing more.

Greenfield repo. Scope: foundation + Increments 1–3 (REQ-007, REQ-008, REQ-001, REQ-002 rescoped, REQ-021, REQ-015, REQ-018; REQ-003 on hold).

## Layout

- `frontend/` — Angular (REQ-020) recipient + support shell + dev harness.
- `backend/` — Node 20 Lambda handlers behind API Gateway HTTP API.
- `infra/` — Terraform (REQ-017) for all AWS: S3 + DynamoDB + API Gateway + Lambda + CloudFront + WAF.
- `docs/runbooks/support-direct-db-access.md` — Phase 1 REQ-007 interim interface (direct DB + audited reset Lambda).
- `SECURITY.md` — security mechanisms: encryption, auth model, token/DOB verification, audit integrity, tenant isolation, known gaps.
- `infra/deployer-policy.template.json` — least-privilege IAM policy for the deploying user
  (replace `<ACCOUNT_ID>`; suggested name `SecureLinksPilotDeployer`).

## Live dev environment

- Web: `https://d16n45ee81q0jg.cloudfront.net`
- API: `https://oo4ulqov91.execute-api.eu-west-2.amazonaws.com`
- `terraform -chdir=infra output` prints `api_endpoint`, `cloudfront_domain`, `support_group`.

## Pages

All pages are served by CloudFront from the private `securelinks-dev-web` S3 bucket (SPA fallback: unknown paths serve `index.html`, Angular router decides). Every page uses the shared WCAG 2.1 AA shell: skip link, banner nav, `<main>` landmark, footer noting that SMS dispatch is owned upstream.

### `/d/:token` — Recipient document access (REQ-001)

The patient-facing page. This is where the secure link from the upstream SMS lands.

- **Purpose:** prove the visitor is the intended recipient, then hand them the PDF. No login, no account, no cookies — knowledge-based verification only.
- **Flow:** token arrives in the URL path → native date input collects the date of birth → `POST /verify` with `{token, dateOfBirth}` → on 200 the page shows the document reference and a 5-minute presigned download link that opens the PDF in a new tab.
- **States shown:** checking link / form / verifying / verified (download link) / error message / locked (with `lockedUntil` time). All error and success regions are ARIA live.
- **Failure behaviour:** wrong DOB → inline error, attempts counted server-side; 5th wrong attempt → 15-minute lockout, and correct DOB during lockout still fails.
- **Audit:** every outcome is recorded (`success`, `failure`, `lockout`, `expired`, `access_attempt`).
- **Known caveat:** the link the page receives (`accessUrl`) points at the CloudFront domain; if the upstream SMS still embeds the raw API domain, the token is valid either way — the page only needs `:token`.

### `/support/health` — Delivery queue and integration health (REQ-007)

The support tool for tracing one document through the delivery pipeline.

- **Purpose:** answer "why did this patient not get / cannot open their document?" for a specific document, using only data SecureLinks owns.
- **Inputs:** Document ID (the `documentId` UUID from the upload response) **and** Customer ID (the tenant used at upload). Both required; the pair is ownership-checked server-side (wrong customer → 404), so a support user cannot inspect another tenant's document.
- **Output:** document reference, `viewed` yes/no, DOB failure count, locked yes/no (+ until when), and the 20 most recent audit events newest-first (`upload`, `access_attempt`, `success`, `failure`, `lockout`, `lockout_reset`, `expired`, `fallback`).
- **Scope note:** the page shows what SecureLinks recorded; actual SMS carrier state lives in Prism/Firetext. A document with no `success` event and an old `upload` is the trigger for the REQ-003 physical-letter fallback (not yet built).
- **Next action:** if `locked: yes`, run the audited reset (`POST /support/reset-lockout`) — see `docs/runbooks/support-direct-db-access.md` for the Phase 1 interim procedure.
- **Known caveat:** the browser call is unsigned, so it only works through the local dev proxy today; the route itself is IAM-auth and ready for an SSO front door.

### `/support/lockouts` — Lockout runbook pointer (REQ-007)

- **Purpose:** deliberately minimal. Phase 1 policy is that lockout resets go through the audited reset function (or direct DB per the runbook), not through an admin UI. The page states that and links to `docs/runbooks/support-direct-db-access.md`. A dedicated admin UI is an explicitly deferred future enhancement.

### `/dev/harness` — Upload + SMS-preview test harness (REQ-021)

Local/integration-testing tool, not a product page.

- **Purpose:** exercise the corner's handoff without touching production tooling: pick a real PDF, fill the metadata the corner would send, post it to `POST /dev/upload`, and see both the resulting `accessUrl` and a simulated SMS bubble using the `sms:+447700900077?body=...` template.
- **Display-only guarantee:** nothing is composed, queued, or sent. The preview is a `<blockquote>` string.
- **Inputs:** PDF file (client-side type check), customerId, recipientId, verificationValue (DOB), expiryDate (must be future), originalFilename (auto-filled from the file), documentReference.
- **Errors:** the API's structured 400s (including the `missing` field list) render inline.
- **Availability:** `/dev/upload` only exists while `enable_dev_routes = true` (dev tfvars); the page itself is harmless in other environments but its submit will 404.

## API endpoints

Base URL: `https://oo4ulqov91.execute-api.eu-west-2.amazonaws.com` (CloudFront also proxies `/verify` and `/dev/upload`). IAM-auth routes require SigV4-signed requests from a principal with `execute-api:Invoke` on that route; the support group policy scopes support users to read/reset only.

### `GET /health` — foundation probe (public)

Returns `{status, service, phase}` (200). Used by the stop-rule check and as a cheap uptime probe. Touches no AWS resources beyond the runtime.

### `POST /documents` — document upload (IAM, REQ-008)

The corner's integration point. Accepts one document per call:

```json
{
  "customerId": "…", "recipientId": "…",
  "verificationValue": "1990-01-31",
  "expiryDate": "2026-09-30",
  "originalFilename": "letter.pdf",
  "documentReference": "REF-123",
  "pdfBase64": "JVBERi0xLjQ…",
  "additionalFactors": [{ "type": "postcode", "value": "SW1A 1AA" }]
}
```

- Validates the seven mandatory fields (400 + `missing` list), Base64-decodes, enforces `%PDF-` magic bytes and a 10 MB cap, requires a future expiry.
- `additionalFactors` (REQ-018, optional): extra verification factors from the registered set (`postcode`, `accountNumber`, `otp`); unknown types → 400. Every factor's value is hashed (per-factor salt) and stored in the row's ordered `verificationFactors` list — plaintext is never persisted.
- Stores the PDF in S3 (`documents/<uuid>.pdf`, SSE-KMS) and the document row: factor hashes, SHA-256 access-token hash, decoded `sizeBytes` (REQ-015), TTL from expiry, `viewedStatus: false`, plus an `upload` audit event.
- 201 → `{documentId, accessUrl, expiryDate}`. `accessUrl` is `https://<cloudfront>/d/<token>` — the short link the corner embeds in its SMS. The access token is never stored; only its hash.

### `POST /dev/upload` — unsigned upload alias (dev only, REQ-021)

Identical behaviour to `POST /documents`, no auth. Exists so the local harness can call the live pipeline without AWS credentials in the browser. Gated by `enable_dev_routes` (dev tfvars only); abuse is limited to creating dev documents.

### `POST /verify` — recipient verification (public, REQ-001)

```json
{ "token": "…", "dateOfBirth": "1990-01-31" }
```

- Resolves the token via the `byAccessToken` GSI (+ full-row read), rejects expired links (410), checks the lockout counter first (429 + `lockedUntil`).
- **Multi-factor verification (REQ-018):** the document's stored factor list must all match — DOB from `dateOfBirth`, other factors from `factorValues: {"postcode": "…"}`. Any wrong or missing candidate → 401, counter +1, `failure` audit; 5th failure → 15-minute lockout, `lockout` audit; attempts while locked → `access_attempt` audit + 429. All comparisons are timing-safe per-factor hashes.
- Success → resets the counter, sets `viewedStatus: true` once, writes `success` audit, emits the `DocumentVerified` usage metric, returns 200 `{documentId, documentReference, downloadUrl, expiresInSeconds}` where `downloadUrl` is a 5-minute S3 presigned GET (inline PDF disposition, original filename).

### `GET /support/health?documentId=…&customerId=…` — support read model (IAM, REQ-007)

Backs the `/support/health` page. Ownership-checked pair; returns viewed/failed/locked state plus the 20 newest audit events. 400 if either parameter missing, 404 on tenant mismatch or unknown document.

### `POST /support/reset-lockout` — audited lockout reset (IAM, REQ-007)

```json
{ "documentId": "…", "customerId": "…", "reason": "…" }
```

All three required. Ownership-checked (wrong customer → 404). Zeros the failure counter, removes `lockedUntil`, and writes a `lockout_reset` audit event carrying the caller's IAM ARN and the free-text reason. Returns `{documentId, customerId, reset, resetAt, actor}`.

### `GET /reports/document-events` — reporting API (IAM, REQ-006)

The Prism-facing audit query. Params: `customerId` (required), `from`/`to` (ISO window), `limit` (1–100, default 50), `nextToken` (opaque, base64url). Queries the `byCustomerTime` GSI newest-first, post-filters to the customer, and joins `documentReference` only for documents that customer owns. Returns `{customerId, events[], generatedBy, nextToken?}` where each event is `{documentId, eventId, timestamp, type, actor, documentReference?, detail?}`.

### `GET /reports/usage?customerId=…` — commercial usage aggregation (IAM, REQ-015)

Billing and capacity reporting. Params: `customerId` (required), optional `nextToken` (opaque). Aggregates the customer's documents from the `byCustomer` GSI (internal pagination up to 4,000 rows) into `{documentsUploaded, documentsViewed, storageBytes, fallbackNotified, firstUploadAt, lastUploadAt, scanned, truncated, nextToken?}`. `storageBytes` sums the decoded PDF sizes recorded at upload (documents uploaded before REQ-015 carry no `sizeBytes` and count as 0). Attribution: `generatedBy` carries the caller's IAM ARN.

### Usage metrics stream (REQ-015)

Handlers also emit CloudWatch Embedded Metric Format lines (`SecureLinks` namespace, `CustomerId` dimension): `DocumentUploaded`, `DocumentVerified`, `VerificationFailure`. These feed billing dashboards, alarms, and capacity planning without any PHI in the metric payload (dimensions carry only the tenant identifier).

Prism/Firetext own SMS dispatch — SecureLinks never sends SMS (REQ-002 rescoped to short-link issuance).

### Access URL anatomy (REQ-002)

`POST /documents` returns an `accessUrl` shaped like:

```
https://d16n45ee81q0jg.cloudfront.net/d/Vq7Zk3xW9pLm2Qf8RhTc1g
└────── host (31 chars, dev) ──┘└3┘└─ 22 chars token ─┘
≈ 61 characters total
```

| Component | Size | Notes |
|---|---|---|
| Host | 31 chars (dev) | `ACCESS_URL_BASE` env on the upload Lambda. Production will use a short custom domain via ACM cert, cutting this to ~15–25 chars |
| Path | 3 chars | Fixed `/d/` prefix, routed by CloudFront to the web bucket SPA |
| Token | 22 chars | `randomBytes(16)` base64url-encoded — 128 bits of entropy, unguessable; never stored raw (only its SHA-256 hash) |

**SMS budget:** GSM-7 segments hold 160 characters, so at ~61 chars the corner keeps ~99 characters for message text in a single segment. Worst-case legacy tokens from before the size change were 82 chars — also single-segment.

**Security model for the link:**

- 128-bit random token: guessing odds are negligible, and the per-document rate limit (5 wrong DOBs → 15-minute lockout) plus WAF rate rules protect the `/verify` path from enumeration.
- Token is validated by SHA-256 lookup; the database leak surface does not expose live links.
- The link is **capability-style, not secret-by-obscurity alone**: even with the token, the PDF only renders after a correct DOB. Token possession + DOB knowledge are both required.
- The link never expires server-side before the document `expiryDate` (TTL row + S3 lifecycle), so expiry is the corner's chosen retention window, not the URL length.
- Planned: shorter custom domain for production (pending ACM cert + aliases; also unblocks restoring `minimum_protocol_version = "TLSv1.2_2021"`).

## Developer how-tos

### Prerequisites

`node >= 20`, `terraform >= 1.6`, AWS CLI with a user holding the deployer policy.

### Install

```powershell
npm install
```

### Backend: build + test

```powershell
npm run build:backend
npm --workspace backend run test
```

### Frontend: local dev server

```powershell
npm run dev:frontend   # port 4200; proxy.conf.json forwards /verify, /documents, /dev/upload to the live API
```

Harness: `http://localhost:4200/dev/harness`. DOB demo: `http://localhost:4200/d/<token>`.

### Frontend: build + host

```powershell
npm run build:frontend
aws s3 sync ./frontend/dist/frontend/browser s3://securelinks-dev-web --region eu-west-2 --delete
aws cloudfront create-invalidation --distribution-id EUMHA9TIOFMV9 --paths '/*'
```

### Terraform: validate → plan → apply (from `infra/`)

```powershell
terraform validate
terraform plan -input=false -out=tfplan
terraform apply -input=false -auto-approve tfplan
```

Local `infra/terraform.tfvars` (gitignored) supplies `environment`, `aws_region`,
`api_prism_key_value` (placeholder — unused), and `enable_dev_routes = true` (dev only).
`tfplan` files are gitignored.

### Smoke tests

```powershell
# Public health
curl https://oo4ulqov91.execute-api.eu-west-2.amazonaws.com/health
# Direct Lambda invoke (needs lambda:InvokeFunction)
aws lambda invoke --function-name securelinks-dev-health --region eu-west-2 out.json
```

### First commit hygiene

`.gitignore` covers `node_modules/`, `dist/`, `dist.zip`, `.angular/`, `.terraform/`,
`*.tfstate*`, `*.tfvars` (except `dev.tfvars.example`), `tfplan`, `.env*`, `.agents/`.
Commit `infra/.terraform.lock.hcl`, `*-lock.json`, and `deployer-policy.template.json`.

## Constraints honoured

- TLS 1.2+, SSE-KMS, WAF, OWASP, WCAG 2.1 AA shell, 90-day purge, Angular + serverless no-EC2.
