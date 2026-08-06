# cravnest-frontend

Angular frontend for the **Cravnest** cloud kitchen SaaS platform.

## Deployment Sequence

```
1. cravnest-infra deployed first  → creates S3, CloudFront, Cognito, API Gateway + SSM params
2. cravnest-services deployed     → real Lambda code live
3. This repo (cravnest-frontend)  → reads SSM params, builds, deploys to S3, invalidates CF
```

## Runtime configuration

Config is injected at build time from AWS SSM Parameter Store (no CloudFormation dependency):

```
/cravnest/{env}/api-url             → API Gateway URL
/cravnest/{env}/user-pool-id        → Cognito User Pool ID
/cravnest/{env}/user-pool-client-id → Cognito App Client ID
/cravnest/{env}/frontend-bucket-name
/cravnest/{env}/frontend-distribution-id
```

The `src/assets/env.template.js` file is populated via `envsubst` during CI/CD and produces
`src/assets/env.js` which is loaded at runtime.

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build.yml` | Every push / PR | Install, test, build |
| `deploy-staging.yml` | Push to `main` | Deploy to `test` environment |
| `create-release.yml` | Manual dispatch | Bump version + create GitHub release tag |
| `deploy-release.yml` | Manual dispatch | Deploy a specific release tag to `test` or `prod` |

## GitHub Actions Secrets required

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_TO_ASSUME` | OIDC role ARN |
| `AWS_REGION` | e.g. `ap-south-1` |

## Local development

```bash
npm install
ng serve
# App reads env.ts fallback values for local dev
```
