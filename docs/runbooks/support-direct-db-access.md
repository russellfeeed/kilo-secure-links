# Support direct database access runbook (REQ-007 Phase 1)

Status: interim. A dedicated admin UI is planned long-term and intentionally not built here.

## What support can do

1. Monitor integration health and delivery queues by reading DynamoDB + CloudWatch — never from patient devices.
2. Investigate a verification lockout for one `documentId` within its owning `customerId`.
3. Resolve a lockout only through the audited `POST /support/reset-lockout` Lambda.

## Read path

- `GET /support/health?documentId=...&customerId=...` (IAM `Support` group required).
- Response contains `viewedStatus`, `failedCount`, `locked`, `lockedUntil`, and the latest 20 audit events.
- All reads are scoped by `customerId`; cross-customer reads return 404.
- SMS queue state is Prism-reported and mirrored in audit records. SecureLinks sends no SMS.

## Direct DynamoDB fallback (break-glass only)

Least-privilege policy `support-read` allows only:

- `dynamodb:GetItem`, `dynamodb:Query` on `*-documents`, `*-audit-events` (+GSIs), `*-verification-counters`.
- `execute-api:Invoke` on `GET /support/health`.

No `PutItem`, `UpdateItem`, or `DeleteItem` on any table through this policy.

## Reset path (audited)

`POST /support/reset-lockout` with JSON:

```json
{ "documentId": "doc_123", "customerId": "york", "reason": "Patient verified by phone, DOB confirmed" }
```

The Lambda:

1. Sets `failedCount = 0` and removes `lockedUntil` on `verification-counters`.
2. Appends an immutable `lockout_reset` event to `audit-events` with actor + timestamp + reason.
3. Cannot delete or modify audit history (IAM explicit deny on `DeleteItem`/`BatchWriteItem` for the app role).

## Verify the intervention

Query `audit-events` for `documentId` ordered newest-first and confirm the `lockout_reset` entry.
