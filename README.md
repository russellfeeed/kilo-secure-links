# SecureLinks — Phase 1 Pilot Foundation

Greenfield repo. `0/20 delivered` at start. Scope: foundation + REQ-007 only.

## Layout

- `frontend/` — Angular (REQ-020) recipient + support shell. Skeleton routes only in foundation.
- `backend/` — Node 20 Lambda handlers behind API Gateway HTTP API.
- `infra/` — Terraform (REQ-017) for all AWS: S3 + DynamoDB + API Gateway + Lambda + CloudFront + WAF.
- `docs/runbooks/support-direct-db-access.md` — Phase 1 REQ-007 interim interface (direct DB + audited reset Lambda).

## Foundation stop rule

`terraform validate` clean, `backend` TypeScript compiles, `frontend` builds. No feature behaviour beyond `/health`.

## REQ-007 (Increment 1)

See `docs/runbooks/support-direct-db-access.md` + `backend/src/support/*` for health/queue read model and lockout reset.
Prism/Firetext own SMS dispatch — SecureLinks never sends SMS.

## Constraints honoured

- TLS 1.2+, SSE-KMS, WAF, OWASP, WCAG 2.1 AA shell, 90-day purge, Angular + serverless no-EC2.
