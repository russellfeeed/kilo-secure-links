# SecureLinks — Security Mechanisms

This document describes the security mechanisms in place, where each is enforced, and what the known gaps are. Code references point at the enforcing file. See `README.md` for functional docs and `docs/aws-infrastructure.md` for the architecture diagram.

## Summary of posture

- No EC2, no databases exposed to the internet, no long-lived patient-identifiable data at rest in plaintext.
- All access to documents requires **two independent factors**: a 128-bit random capability token (possession) **and** knowledge of the recipient's date of birth (knowledge) — plus server-side rate limiting.
- Encryption everywhere: TLS 1.2+ in transit, AWS KMS SSE at rest for PDFs, encrypted DynamoDB tables.
- Immutable, attributed audit trail with explicit IAM deny on deletion.

## 1. Data protection

| Data | At rest | Notes |
|---|---|---|
| PDF payloads | SSE-KMS, dedicated CMK (`infra/kms.tf`), S3 Bucket Keys on | `PutObject` with `ServerSideEncryption: aws:kms` (`backend/src/upload.ts`) |
| Document metadata rows | DynamoDB default encryption + PITR | `infra/dynamodb.tf` |
| Audit events | DynamoDB encryption + PITR | append-only, see §4 |
| Verification values (DOB + any additional factors) | **Never stored in plaintext** — per-factor salted SHA-256 hashes only (`securelinks:v1:<type>:` prefixes) | factor registry (`backend/src/factors.ts`) |
| Access tokens | **Never stored raw** — SHA-256 hash only, looked up via `byAccessToken` GSI (KEYS_ONLY projection, so the index cannot leak row data) | `backend/src/upload.ts`, `backend/src/verify.ts` |
| Verification counters | DynamoDB encryption + PITR | |
| In transit | CloudFront enforces `redirect-to-https` on every behavior; API origin is `https-only`; custom origin limited to TLSv1.2 | `infra/cdn-waf.tf` |

Retention: document rows carry a TTL equal to the corner-supplied `expiryDate`; the S3 lifecycle rule purges objects after 90 days. The upstream caller controls data lifetime; SecureLinks does not retain beyond it.

## 2. Authentication & authorisation

| Route | Auth | Enforcement |
|---|---|---|
| `POST /documents` | AWS_IAM (SigV4) | API Gateway route; callers need `execute-api:Invoke` |
| `GET /reports/document-events`, `GET /reports/usage` | AWS_IAM | same |
| `GET /support/health`, `POST /support/reset-lockout` | AWS_IAM | support group policies grant only these routes + table reads |
| `POST /verify` | Public (token + verification factors) | capability model, see §3 |
| `GET /health` | Public | no data access |
| `POST /dev/upload` | **None — dev only** | route exists only while `enable_dev_routes = true` (dev tfvars); abuse limited to creating dev documents |

Tenant isolation: every tenant-scoped request must present the matching `customerId`; handlers (`support/health.ts`, `support/resetLockout.ts`, `report.ts`) return 404 on mismatch, so no cross-tenant read or reset is possible even with a leaked document ID.

Least privilege:

- `lambda_data` policy (`infra/lambda.tf`): read/write only on the three tables, S3 object actions only, KMS use scoped to the one CMK, and an **explicit Deny** on `dynamodb:DeleteItem`/`BatchWriteItem` for the audit table.
- `securelinks-dev-support` group: `GetItem`/`Query` reads and `execute-api:Invoke` on the two support routes only. No writes.
- Deploying human: `infra/deployer-policy.template.json` is least-privilege, resource-scoped to `securelinks-dev-*` ARNs, with `iam:PassRole` conditioned on `lambda.amazonaws.com`.

## 3. Document access model (link + verification factors)

- **Capability token:** 16 random bytes → 22 base64url chars (128-bit entropy), generated with Node crypto CSPRNG. Only its SHA-256 hash is persisted; DB compromise does not expose live links. Verification is a hash lookup, and comparison uses `timingSafeEqual` (`backend/src/documents.ts`).
- **Pluggable verification factors (REQ-018):** every document stores an ordered `verificationFactors` list (per-factor salted SHA-256 hashes — `securelinks:v1:<type>:` prefixes); DOB is always present as the primary factor, additional factors (`postcode`, `accountNumber`, `otp`) may be supplied at upload. Verification requires **all** stored factors to match, with candidates resolved from the request (`dateOfBirth` + `factorValues`). Values are never persisted in plaintext; the registry (`backend/src/factors.ts`) makes new factors a one-call addition with no handler redesign.
- **Rate limiting & lockout:** 5 failed factor checks → 15-minute lockout held in `verification_counters`; correct factors during lockout are still rejected; attempts-while-locked are audited (`access_attempt`) (`backend/src/verify.ts`).
- **Presigned download:** issued only after successful factor verification, 5-minute TTL, `inline` content disposition with sanitised filename, KMS-decrypted via the Lambda role — no public S3 access path exists.
- **WAF:** AWS managed rule groups (CommonRuleSet) attached to the CloudFront distribution (`CLOUDFRONT` scope, us-east-1) in front of all routes.

## 4. Audit trail & integrity

- Every material action writes an audit event: `upload`, `access_attempt`, `success`, `failure`, `lockout`, `lockout_reset`, `expired`, `fallback` (reserved), `deleted` (`backend/src/model.ts`).
- Events are **attributed**: IAM ARN of the actor for support/upload actions (`supportActor`), `recipient:anonymous` for patient-side events.
- Writes use `attribute_not_exists(eventId)` condition expressions — no in-place mutation by the application.
- The Lambda execution role carries an explicit IAM **Deny** on delete/batch-write against the audit table (`infra/lambda.tf`), so application code cannot rewrite history even if compromised.
- Point-in-time recovery is enabled on all three tables.
- Queries for Prism (`GET /reports/document-events`) are ownership-filtered by `customerId`; the usage aggregation (`GET /reports/usage`) is likewise customer-scoped.

**Metrics hygiene (REQ-015):** the CloudWatch EMF stream (`DocumentUploaded`, `DocumentVerified`, `VerificationFailure`) carries only the tenant identifier (`CustomerId` dimension) and counters — no document IDs, no hashes, no recipient data.

## 5. Multi-tenant isolation (REQ-009)

- Shared tables, logical isolation: every document row and audit event carries `customerId`; all tenant-facing handlers enforce ownership and return 404 on mismatch (live-tested cross-tenant).
- S3 keys are namespaced per document UUID; objects are KMS-encrypted; bucket is fully private behind OAC.
- Support group access is scoped to `securelinks-dev-*` resources only.

## 6. Network & infrastructure

- Serverless only (Lambda + API Gateway HTTP API + CloudFront); no EC2, no public database endpoints.
- Both S3 buckets: Block Public Access on all four settings; bucket policies restrict `GetObject` to the specific CloudFront distribution ARN via OAC conditions (`infra/web.tf`, `infra/s3.tf`).
- `infra` is Terraform IaC; runtime access for humans is limited by the deployer policy, not admin.

## 7. Secrets handling

- `api_prism_key_value` is declared `sensitive` and unused until REQ-007 integration lands; real keys must be injected at deploy time, never committed.
- Gitignored: `*.tfvars`, `.env*`, `tfplan` (plans embed account state), `*.tfstate*` (state can contain hashes only, but still treated as sensitive), `.agents/`.
- Committed: sanitised `dev.tfvars.example` and the `<ACCOUNT_ID>`-parameterised deployer policy template. No credentials in the repo.
- Browsers never hold AWS credentials: the dev harness posts to the unsigned `/dev/upload` alias instead of shipping keys client-side.

## 8. Known gaps & roadmap

1. **TLS floor:** with the default CloudFront certificate, `minimum_protocol_version` is currently the service default; `TLSv1.2_2021` is configured-out until the custom domain + ACM cert land (it was silently downgraded to TLSv1 and caused plan drift). `redirect-to-https` is active meanwhile.
2. **Support-page front door:** `/support/*` routes are IAM-auth, but the browser pages call them unsigned; a Cognito/SSO front door is needed before non-developer support use.
3. **State backend:** Terraform state is local (`init -backend=false`); move to a versioned, locked S3 backend before multi-operator work.
4. **Human auth:** the deployer uses an IAM user with long-lived keys; prefer SSO/role assumption + MFA for production.
5. **WAF rate-based rule:** managed rule groups are attached; an explicit `RateBasedStatement` on `/verify` would add request-flood protection.
6. **Audit immutability beyond IAM deny:** current guarantee is the app-role Deny; for stronger guarantees consider Object Lock / KMS-signed event streams or a write-once log sink.
