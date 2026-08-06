# cravnest-services

Lambda service code for the **Cravnest** cloud kitchen SaaS platform.

## Repository structure

```
lambda/
  orders/          Orders CRUD + slot availability + order history
  items/           Items CRUD + image upload URL generation
  slot-management/ Weekly slot generation (EventBridge scheduled)
  ttl-cleanup/     DynamoDB TTL expiry handler (DynamoDB Stream triggered)
  order-audit/     Order change audit trail (DynamoDB Stream triggered)
```

## Deployment Sequence (full first-time setup)

```
1. Run cravnest-infra deploy.yml  → creates Lambda functions with placeholder code + LIVE alias
2. Run Pipeline 1 (deploy)        → builds real code, uploads ZIP, updates $LATEST
3. Run Pipeline 2 (release)       → publishes immutable version, optionally starts canary
4. Run Pipeline 3 (promote)       → switches LIVE alias to 100% new version
```

For subsequent updates:
```
Pipeline 1 → Pipeline 2 → Pipeline 3
```

## Pipelines

### Pipeline 1 — `1-deploy.yml` — Build & Deploy to `$LATEST`

Updates the Lambda function code without affecting any alias.
LIVE traffic is **not impacted**.

| Input | Description |
|-------|-------------|
| `lambda` | Which lambda to target (dropdown) |
| `environment` | `test` or `prod` |

### Pipeline 2 — `2-release-version.yml` — Publish New Version

Publishes current `$LATEST` as a new immutable numbered version.
Optionally splits LIVE alias traffic for canary testing.

| Input | Description |
|-------|-------------|
| `lambda` | Which lambda to target (dropdown) |
| `environment` | `test` or `prod` |
| `canary_percentage` | `0` = publish only; `10` = 10% canary on LIVE alias |

### Pipeline 3 — `3-traffic-switch.yml` — Promote / Rollback

Atomically moves the LIVE alias to any published version.
Clears any canary split.

| Input | Description |
|-------|-------------|
| `lambda` | Which lambda to target (dropdown) |
| `environment` | `test` or `prod` |
| `action` | `promote` or `rollback` |
| `target_version` | Version number (e.g. `5`). Leave empty on promote to auto-use pending version. |

## GitHub Actions Secrets required

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_TO_ASSUME` | OIDC role ARN |
| `AWS_REGION` | e.g. `ap-south-1` |
| `LAMBDA_DEPLOY_BUCKET` | S3 bucket name for lambda ZIPs |
