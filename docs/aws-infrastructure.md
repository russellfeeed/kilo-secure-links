# SecureLinks AWS Infrastructure Diagram

Built with Terraform (`infra/`). Dev-only resources (`enable_dev_routes`) not shown.

```mermaid
flowchart TB
    subgraph Client[Client / Browser]
        A[SPA: /dev/harness, /support/health, /support/lockouts]
        B[Document access: /d/:token]
    end

    subgraph "CloudFront (d16n45...)"
        WAF[WAFv2 ACL — us-east-1 CLOUDFRONT]
        CF[Distribution<br/>web_acl_id = WAF]
        OAC_web[OAC — web origin]
        OAC_docs[OAC — docs origin]
    end

    Client -->|/verify, /dev/upload, API paths| CF
    Client -->|/d/:token, /dev/harness, root /| CF
    WAF -->|protects| CF

    subgraph "CloudFront Origins"
        ORG_WEB["S3 web bucket<br/>securelinks-dev-web<br/>(OAC, default + /dev/harness SPAs, /d/* docs)"]
        ORG_DOCS["S3 docs bucket<br/>securelinks-dev-documents<br/>(KMS SSE, version suspended, 90-day purge)"]
        ORG_API["API Gateway HTTP API<br/>oo4ulqov91.execute-api.eu-west-2"]
    end

    CF -->|default / /dev/harness| ORG_WEB
    CF -->|/d/*| ORG_DOCS
    CF -->|/verify /dev/upload (no cache, headers forwarded)| ORG_API

    subgraph Lambda[Lambda — eu-west-2]
        L_HEALTH[securelinks-dev-health]
        L_UPLOAD[securelinks-dev-upload<br/>S3 Put + DynamoDB + audit]
        L_VERIFY[securelinks-dev-verify<br/>token lookup + DOB + lockout + S3 presign URL]
        L_REPORT[securelinks-dev-report<br/>audit query by customer]
        L_SUPPORT_H[securelinks-dev-support-health]
        L_SUPPORT_R[securelinks-dev-support-reset]
    end

    ORG_API -->|GET /health| L_HEALTH
    ORG_API -->|POST /documents| L_UPLOAD
    ORG_API -->|POST /dev/upload (dev only)| L_UPLOAD
    ORG_API -->|POST /verify| L_VERIFY
    ORG_API -->|GET /reports/document-events| L_REPORT
    ORG_API -->|GET /support/health| L_SUPPORT_H
    ORG_API -->|POST /support/reset-lockout| L_SUPPORT_R

    subgraph DynamoDB["DynamoDB — eu-west-2 — PAY_PER_REQUEST + PITR + encryption"]
        D_DOCS[documents table<br/>PK documentId<br/>GSI byCustomer, GSI byAccessToken<br/>TTL ttl, viewedStatus]
        D_AUDIT[audit_events table<br/>PK documentId / SK eventId<br/>GSI byCustomerTime<br/>types: upload/access/success/failure/lockout/reset/expired/fallback]
        D_COUNTER[verification_counters table<br/>PK documentId<br/>failedCount, lockedUntil]
    end

    L_UPLOAD -->|PutItem + audit Put| D_DOCS
    L_UPLOAD --> D_AUDIT
    L_VERIFY -->|GetItem / GetCounter / UpdateItem / audit Put| D_DOCS
    L_VERIFY -->|counter read/update| D_COUNTER
    L_VERIFY --> D_AUDIT
    L_REPORT -->|Query byCustomerTime| D_AUDIT
    L_REPORT -->|GetItem ownership check| D_DOCS
    L_SUPPORT_H --> D_DOCS
    L_SUPPORT_H --> D_COUNTER
    L_SUPPORT_H --> D_AUDIT
    L_SUPPORT_R --> D_DOCS
    L_SUPPORT_R --> D_COUNTER
    L_SUPPORT_R --> D_AUDIT

    subgraph S3_Storage[S3 + KMS]
        S3_DOCS[documents bucket<br/>KMS key — aws:kms<br/>SSE-KMS, lifecycle 90-day purge]
    end

    L_UPLOAD -->|PutObject (KMS encrypt)| S3_DOCS
    L_VERIFY -->|GetObject presigned URL (KMS decrypt)| S3_DOCS

    subgraph IAM[Access Control]
        GROUP[support group<br/>securelinks-dev-support]
        EXEC[lambda_exec role + basic + data policy]
    end

    L_HEALTH -.-> EXEC
    L_UPLOAD --> EXEC
    L_VERIFY --> EXEC
    L_REPORT --> EXEC
    L_SUPPORT_H --> EXEC
    L_SUPPORT_R --> EXEC
```

## Key routing notes

- API Gateway (`oo4ulqov91.execute-api.eu-west-2.amazonaws.com`) routes through CloudFront. No direct invoke.
- `/dev/upload` is unsigned in dev (`enable_dev_routes`); `POST /documents` requires IAM auth (deploy policy: `execute-api:Invoke` on `POST /documents`).
- `/verify` is public; `/support/health` and `/support/reset-lockout` are IAM-protected.
- `/dev/harness*` serves the Angular SPA build from the web bucket; `/d/*` serves PDF document objects; SPA fallback handles 403/404 → `/index.html`.
- `ACCESS_URL_BASE` in Lambda env points to `https://${cloudfront_domain}`.
