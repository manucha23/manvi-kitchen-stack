# AWS OIDC Setup for GitHub Actions

This guide explains how to set up AWS IAM trust policies for GitHub Actions to deploy CDK stacks without storing AWS access keys.

## Overview

The workflow uses AWS OpenID Connect (OIDC) for authentication instead of long-lived AWS credentials. This provides:
- ✅ No stored AWS access keys in GitHub
- ✅ Automatic credential rotation
- ✅ Fine-grained permission control per GitHub environment
- ✅ Audit trail of all deployments

## Prerequisites

- AWS accounts for test and prod environments
- Access to AWS IAM console in both accounts
- GitHub repository settings access

## Setup Steps

### Step 1: Create OIDC Identity Provider in AWS (Both Accounts)

Perform these steps in **both test and prod AWS accounts**:

1. Go to **AWS IAM Console** → **Identity Providers**
2. Click **Add Provider**
3. Select **OpenID Connect**
4. Configure:
   - **Provider URL**: `https://token.actions.githubusercontent.com`
   - **Audience**: `sts.amazonaws.com`
5. Click **Add Provider**

### Step 2: Create Deployment IAM Role (Test Account)

In your **test AWS account**:

1. Go to **AWS IAM Console** → **Roles** → **Create Role**
2. Select **Custom trust policy**
3. Replace the trust policy with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::TEST_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/manvi-kitchen-stack:ref:refs/heads/develop"
        }
      }
    }
  ]
}
```

**Replace:**
- `TEST_ACCOUNT_ID` with your test AWS account ID
- `YOUR_GITHUB_ORG` with your GitHub organization/username
- `develop` if deploying test from different branch

5. Click **Next**
6. Attach the following inline policy named `CDKDeploymentPolicy`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "iam:*",
        "dynamodb:*",
        "apigateway:*",
        "lambda:*",
        "logs:*",
        "ec2:DescribeAvailabilityZones",
        "ec2:DescribeImages",
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::TEST_ACCOUNT_ID:role/cdk-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "lambda.amazonaws.com",
            "cloudformation.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

7. Name the role: `GitHubActionsDeployTest`
8. Create role and copy its **ARN** (e.g., `arn:aws:iam::123456789012:role/GitHubActionsDeployTest`)

### Step 3: Create Deployment IAM Role (Prod Account)

In your **prod AWS account**, repeat Step 2 with:

**Trust Policy Differences:**
- Replace `TEST_ACCOUNT_ID` with `PROD_ACCOUNT_ID`
- Replace `develop` with `main` (or your prod branch)

**Inline Policy:**
- Replace `TEST_ACCOUNT_ID` with `PROD_ACCOUNT_ID`

**Role Name:** `GitHubActionsDeployProd`

Copy the role **ARN** after creation.

### Step 4: Create GitHub Environments

In your **GitHub repository**:

1. Go to **Settings** → **Environments** → **New environment**
2. Create environment named `test`:
   - Add secrets:
     - `AWS_ACCOUNT_ID`: Your test AWS account ID
     - `AWS_REGION`: Your test region (e.g., `us-east-1`)
     - `AWS_ROLE_TO_ASSUME`: Test role ARN from Step 2
   
3. Create environment named `prod`:
   - Add secrets:
     - `AWS_ACCOUNT_ID`: Your prod AWS account ID
     - `AWS_REGION`: Your prod region (e.g., `us-east-1`)
     - `AWS_ROLE_TO_ASSUME`: Prod role ARN from Step 3
   - (Optional) Enable **Required reviewers** for manual approval before deployment

## Workflow Behavior

### Branch Mapping

| Branch | Environment | Action |
|--------|-------------|--------|
| `develop` | test | Auto-deploy on push |
| `main` | prod | Auto-deploy on push (or requires approval if enabled) |
| PR to `main`/`develop` | test | Build & test only (no deployment) |

## Verification

1. Push to `develop` branch and watch GitHub Actions
2. Workflow will automatically assume the test account role via OIDC
3. Stack deploys to test account without any stored credentials
4. Check AWS CloudFormation console in test account to confirm deployment

## Troubleshooting

### "Unable to locate credentials" Error
- Verify `AWS_ROLE_TO_ASSUME` secret is set correctly in GitHub environment
- Check OIDC provider exists in AWS IAM
- Verify trust policy conditions match your repo/branch

### "Access Denied" Error
- Verify role permissions include all CDK-required actions
- Check role trust policy restricts to correct GitHub organization/repo
- Ensure role can pass itself to Lambda and CloudFormation services

### CDK Synthesis Fails
- Check `AWS_ACCOUNT_ID` and `AWS_REGION` are set in GitHub environment secrets
- Verify CDK bootstrap resources exist in target account: `cdk bootstrap aws://ACCOUNT_ID/REGION`

## Security Best Practices

1. **Restrict role trust policy** to your repository and specific branches
2. **Use separate AWS accounts** for test and prod (done via this setup)
3. **Enable MFA** on AWS account root user
4. **Limit IAM permissions** to only what CDK requires
5. **Monitor deployments** via CloudTrail and GitHub audit logs
6. **Rotate AWS account credentials** regularly (no impact with OIDC)

## Additional Resources

- [AWS OIDC Documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS CDK Bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
