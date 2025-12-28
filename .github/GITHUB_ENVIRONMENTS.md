# GitHub Environment Configuration

This file documents the GitHub environments needed for the OIDC-based deployment workflow.

## Required GitHub Environments

### Environment: `test`

**Used for:** Deployments to test AWS account when pushing to `develop` branch

**Required Secrets:**
```
AWS_ACCOUNT_ID          = <TEST_ACCOUNT_ID>
AWS_REGION              = <TEST_REGION>
AWS_ROLE_TO_ASSUME      = arn:aws:iam::<TEST_ACCOUNT_ID>:role/GitHubActionsDeployTest
```

**Required Reviewers:** (Optional) Leave empty for automatic deployment

**Deployment branches:** Only allow `develop`

---

### Environment: `prod`

**Used for:** Deployments to prod AWS account when pushing to `main` branch

**Required Secrets:**
```
AWS_ACCOUNT_ID          = <PROD_ACCOUNT_ID>
AWS_REGION              = <PROD_REGION>
AWS_ROLE_TO_ASSUME      = arn:aws:iam::<PROD_ACCOUNT_ID>:role/GitHubActionsDeployProd
```

**Required Reviewers:** (Recommended) Add team members for manual approval

**Deployment branches:** Only allow `main`

---

## How to Create Environments in GitHub

1. Go to your repository on GitHub
2. Click **Settings** (top navigation)
3. Click **Environments** (left sidebar)
4. Click **New environment**
5. Enter environment name (`test` or `prod`)
6. Click **Configure environment**
7. Add secrets under "Environment secrets"
8. (Optional) Add required reviewers
9. (Optional) Configure deployment branches

## Required Secrets Reference

Replace these placeholders with your actual values:

- `<TEST_ACCOUNT_ID>` - AWS account ID for test environment (e.g., `111111111111`)
- `<TEST_REGION>` - AWS region for test (e.g., `us-east-1`)
- `<PROD_ACCOUNT_ID>` - AWS account ID for prod environment (e.g., `222222222222`)
- `<PROD_REGION>` - AWS region for prod (e.g., `us-east-1`)

## Testing the Setup

After creating environments and secrets:

1. Make a commit to the `develop` branch
2. Push to GitHub
3. Go to **Actions** tab to monitor workflow
4. Workflow should automatically deploy to test account
5. Check AWS CloudFormation in test account to verify deployment

For prod, repeat with `main` branch (manual approval may trigger if configured).
