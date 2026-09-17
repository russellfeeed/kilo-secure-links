# SecureLinks — Phase 1 Pilot Foundation

Greenfield repo. Scope: foundation + Increments 1–2 (REQ-007, REQ-008, REQ-001, REQ-002 rescoped, REQ-021).

## Layout

- `frontend/` — Angular (REQ-020) recipient + support shell + dev harness.
- `backend/` — Node 20 Lambda handlers behind API Gateway HTTP API.
- `infra/` — Terraform (REQ-017) for all AWS: S3 + DynamoDB + API Gateway + Lambda + CloudFront + WAF.
- `docs/runbooks/support-direct-db-access.md` — Phase 1 REQ-007 interim interface (direct DB + audited reset Lambda).
- `infra/deployer-policy.template.json` — least-privilege IAM policy for the deploying user
  (replace `<ACCOUNT_ID>`; suggested name `SecureLinksPilotDeployer`).

## Live dev environment

- Web: `https://d16n45ee81q0jg.cloudfront.net`
- API: `https://oo4ulqov91.execute-api.eu-west-2.amazonaws.com`
- `terraform -chdir=infra output` prints `api_endpoint`, `cloudfront_domain`, `support_group`.

## Routes

### Pages (CloudFront → web bucket, SPA fallback to index.html)

| Path | Page | Auth |
|---|---|---|
| `/d/:token` | Recipient DOB verification (REQ-001): DOB form → `POST /verify` → presigned PDF link | Public |
| `/dev/harness` | Local upload + SMS-preview harness (REQ-021): PDF picker + metadata → `POST /dev/upload` → access URL + simulated SMS | Public, dev only |
| `/support/health` | Delivery queue health lookup (REQ-007) | Via API, IAM |
| `/support/lockouts` | Lockout runbook pointer (REQ-007) | Static text |

### API (API Gateway HTTP API; CloudFront proxies `/verify` and `/dev/upload`)

| Method + path | Lambda | Auth | Notes |
|---|---|---|---|
| `GET /health` | `securelinks-dev-health` | Public | Foundation probe |
| `POST /documents` | `securelinks-dev-upload` | IAM | REQ-008: Base64 PDF + metadata → 201 `{documentId, accessUrl, expiryDate}` |
| `POST /dev/upload` | `securelinks-dev-upload` | None (dev only) | REQ-021: unsigned alias, gated by `enable_dev_routes` (dev tfvars only) |
| `POST /verify` | `securelinks-dev-verify` | Public | REQ-001: token + DOB → presigned URL; 401 wrong DOB, 429 after 5 attempts (15-min lockout) |
| `GET /support/health` | `securelinks-dev-support-health` | IAM | REQ-007 read model |
| `POST /support/reset-lockout` | `securelinks-dev-support-reset` | IAM | REQ-007 audited reset |

Prism/Firetext own SMS dispatch — SecureLinks never sends SMS (REQ-002 rescoped to short-link issuance).

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
