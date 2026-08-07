# Cravnest Repository Migration Guide

This folder contains the complete source for three new repositories that replace `manvi-kitchen-stack`.

## Repository overview

| Folder | New repo name | Purpose |
|--------|---------------|---------|
| `migration/cravnest-infra/` | `cravnest-infra` | AWS CDK infrastructure |
| `migration/cravnest-services/` | `cravnest-services` | Lambda function code + deployment pipelines |
| `migration/cravnest-frontend/` | `cravnest-frontend` | Angular frontend |

---

## Step-by-step migration

### 1. Create the three GitHub repositories

Create three new **empty** repositories under your GitHub account:
- `manucha23/cravnest-infra`
- `manucha23/cravnest-services`
- `manucha23/cravnest-frontend`

### 2. Push each repo

```bash
# cravnest-infra
cd migration/cravnest-infra
git init && git add -A && git commit -m "chore: initial commit from monorepo migration"
git remote add origin git@github.com:manucha23/cravnest-infra.git
git push -u origin main

# cravnest-services
cd ../cravnest-services
git init && git add -A && git commit -m "chore: initial commit from monorepo migration"
git remote add origin git@github.com:manucha23/cravnest-services.git
git push -u origin main

# cravnest-frontend
cd ../cravnest-frontend
git init && git add -A && git commit -m "chore: initial commit from monorepo migration"
git remote add origin git@github.com:manucha23/cravnest-frontend.git
git push -u origin main
```

### 3. Create a Lambda deployment S3 bucket

Before running any service pipeline, create an S3 bucket for Lambda ZIPs:

```bash
aws s3 mb s3://cravnest-lambda-deploy-<your-account-id> --region ap-south-1
```

### 4. Configure GitHub Environments and Secrets

Each repo needs GitHub **Environments** (`test` and `prod`) created in Settings → Environments.

#### cravnest-infra secrets (both environments)

| Secret | Value |
|--------|-------|
| `AWS_ROLE_TO_ASSUME` | Your OIDC role ARN |
| `AWS_REGION` | `ap-south-1` |
| `AWS_ACCOUNT_ID` | Your AWS account number |

#### cravnest-services secrets (both environments)

| Secret | Value |
|--------|-------|
| `AWS_ROLE_TO_ASSUME` | Your OIDC role ARN |
| `AWS_REGION` | `ap-south-1` |
| `LAMBDA_DEPLOY_BUCKET` | `cravnest-lambda-deploy-<account-id>` |

#### cravnest-frontend secrets (both environments)

| Secret | Value |
|--------|-------|
| `AWS_ROLE_TO_ASSUME` | Your OIDC role ARN |
| `AWS_REGION` | `ap-south-1` |

### 5. First-time deployment sequence

```
Step 1: Push to main in cravnest-infra
        → deploy.yml runs automatically
        → Creates ALL AWS resources (DynamoDB, Cognito, S3, CloudFront, API GW)
        → Creates Lambda functions with placeholder 503 code + LIVE aliases
        → Writes SSM parameters under /cravnest/test/...

Step 2: In cravnest-services, run Pipeline 1 (1-deploy.yml)
        → Select: lambda=orders, environment=test
        → Builds TypeScript, zips, uploads to S3, updates $LATEST code
        → Repeat for each lambda: items, slot-management, ttl-cleanup, order-audit

Step 3: In cravnest-services, run Pipeline 2 (2-release-version.yml)
        → Select: lambda=orders, environment=test, canary_percentage=0
        → Publishes $LATEST as Version 1
        → Repeat for each lambda

Step 4: In cravnest-services, run Pipeline 3 (3-traffic-switch.yml)
        → Select: lambda=orders, environment=test, action=promote, target_version=1
        → LIVE alias now points to Version 1 (100% real traffic)
        → Repeat for each lambda

Step 5: Push to main in cravnest-frontend
        → deploy-staging.yml runs automatically
        → Reads SSM params (API URL, Cognito config, bucket, distribution ID)
        → Builds Angular app with injected config
        → Deploys to S3, invalidates CloudFront
```

---

## Ongoing deployment workflow

### Deploy a Lambda update

```
1. Push code changes to cravnest-services main
2. Run Pipeline 1 → select lambda + environment
   (updates $LATEST, LIVE alias unchanged)
3. Run Pipeline 2 → select lambda + environment + canary %
   (publishes new version, optionally starts canary)
4. Monitor — if canary looks good:
   Run Pipeline 3 → action=promote
   (switches LIVE alias to 100% new version)
5. If canary shows issues:
   Run Pipeline 3 → action=rollback, target_version=<previous>
   (instant rollback, zero downtime)
```

### Deploy a frontend update

```
1. Push to main → deploy-staging.yml auto-deploys to test
2. For production:
   a. Run create-release.yml → enter version (e.g., 1.1.0)
   b. Run deploy-release.yml → select tag + environment=prod
```

---

## Key architecture decisions

### Lambda versioning model

```
Function ($LATEST) ─── updated by Pipeline 1
    │
    ├── Version 1 (immutable)
    ├── Version 2 (immutable)  ─── published by Pipeline 2
    └── Version N (immutable)
              │
         LIVE alias ──────────────── API Gateway routes here
         (weighted routing optional) switched by Pipeline 3
```

- API Gateway is wired to the **LIVE alias ARN**, never the function ARN directly
- `cravnest-infra` never needs redeployment to update Lambda code
- Traffic switching is instantaneous and zero-downtime

### SSM as the integration layer

All three repos communicate only through SSM Parameter Store.
No repo has a dependency on another repo's CloudFormation stack.

```
/cravnest/{env}/api-url
/cravnest/{env}/user-pool-id
/cravnest/{env}/user-pool-client-id
/cravnest/{env}/frontend-bucket-name
/cravnest/{env}/frontend-distribution-id
/cravnest/{env}/image-bucket-name
/cravnest/{env}/lambda/{name}/function-name
/cravnest/{env}/lambda/{name}/pending-version   (written by Pipeline 2)
/cravnest/{env}/lambda/{name}/live-version      (written by Pipeline 3)
```
