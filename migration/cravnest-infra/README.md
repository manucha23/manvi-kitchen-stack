# cravnest-infra

CDK infrastructure for the **Cravnest** cloud kitchen SaaS platform.

## Deployment Sequence

```
1. cravnest-infra  (this repo)   → AWS resources + SSM params
2. cravnest-services             → Lambda code + versions + alias traffic
3. cravnest-frontend             → Angular app → S3 + CloudFront
```

## What this repo creates

| Resource | Details |
|----------|---------|
| DynamoDB tables | Orders, Items, Inventory, SlotAvailability, OrderHistory |
| Lambda functions | orders, items, slot-management, ttl-cleanup, order-audit |
| Lambda aliases | `LIVE` alias per function (API Gateway routes to this) |
| API Gateway | REST API with Cognito authorizer |
| Cognito | User pool + app client |
| S3 | Frontend bucket + Image bucket |
| CloudFront | Frontend distribution + Image distribution |
| SSM Parameters | All outputs stored under `/cravnest/{env}/...` |

## Lambda placeholder code

Functions are created with **placeholder inline code** (`503 Service not yet deployed`).
Run `cravnest-services` Pipeline 1 → Pipeline 2 → Pipeline 3 to deploy real code.

## SSM Parameters written

```
/cravnest/{env}/api-url
/cravnest/{env}/user-pool-id
/cravnest/{env}/user-pool-client-id
/cravnest/{env}/frontend-bucket-name
/cravnest/{env}/frontend-distribution-id
/cravnest/{env}/image-bucket-name
/cravnest/{env}/lambda/orders/function-name
/cravnest/{env}/lambda/items/function-name
/cravnest/{env}/lambda/slot-management/function-name
/cravnest/{env}/lambda/ttl-cleanup/function-name
/cravnest/{env}/lambda/order-audit/function-name
```

## GitHub Actions Secrets required

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_TO_ASSUME` | OIDC role ARN |
| `AWS_REGION` | e.g. `ap-south-1` |
| `AWS_ACCOUNT_ID` | AWS account number |

## Local development

```bash
npm install
npm test
npx cdk synth -c environment=test
npx cdk deploy -c environment=test
```
