# GitHub Actions Deployment Workflows

## Overview

This directory contains GitHub Actions workflows for automated deployment of the serverless event-driven starter application.

## Workflows

### `deploy-production.yml`

Automated deployment to production environment triggered by GitHub releases.

**Trigger:** When a new GitHub release is published

**What it deploys:**
1. All CDK infrastructure stacks (DNS, Data, Auth, Frontend)
2. SvelteKit frontend application to S3
3. Invalidates CloudFront cache

## Prerequisites

Before using these workflows, ensure the following are set up:

### 1. AWS OIDC Provider (Already Configured ✓)

You've indicated that the OIDC provider is already set up in your AWS account.

### 2. GitHub Environment

A GitHub environment named **PRODUCTION** must exist with the following configuration:

**Environment Secrets:**
- `AWS_ROLE_TO_ASSUME` - The ARN of the IAM role that GitHub Actions will assume
  - Example: `arn:aws:iam::123456789012:role/GitHubActionsDeploymentRole`

**Optional Environment Secrets:**
- `AWS_ACCOUNT_ID` - Your AWS account ID (optional, can be derived from role ARN)

### 3. IAM Role Permissions

The IAM role assumed by GitHub Actions needs permissions for:
- **CloudFormation**: Full access to create/update/delete stacks
- **S3**: Full access for frontend bucket operations
- **CloudFront**: Create invalidations, describe distributions
- **Lambda**: Deploy and update functions
- **API Gateway**: Create and update APIs
- **DynamoDB**: Create and manage tables
- **Route53**: Update DNS records
- **ACM**: Manage certificates
- **IAM**: Create roles and policies for Lambda functions
- **Secrets Manager**: Create and manage secrets
- **CloudWatch Logs**: Create log groups

**Recommended Policy:** `AdministratorAccess` or a custom policy with the above permissions.

### 4. Bootstrap Completed

The `bootstrap.sh` script must have been run at least once to:
- Bootstrap CDK in both regions (eu-west-2 and us-east-1)
- Configure the domain in `cdk/cdk.json`
- Create the Route53 hosted zone
- Set up initial infrastructure

## Usage

### Deploying to Production

1. **Create a new release on GitHub:**
   ```bash
   # Tag your commit
   git tag v1.0.0
   git push origin v1.0.0
   
   # Or use GitHub UI to create a release
   ```

2. **Publish the release:**
   - Go to GitHub → Releases → Draft a new release
   - Choose your tag (e.g., v1.0.0)
   - Add release notes
   - Click "Publish release"

3. **Monitor deployment:**
   - Go to Actions tab in GitHub
   - Watch the "Deploy to Production" workflow run
   - Deployment typically takes 10-15 minutes

### Deployment Process

The workflow executes the following steps:

1. **Authentication**
   - Uses OIDC to assume AWS role (no credentials stored in GitHub)
   - Establishes session with AWS

2. **Setup**
   - Checks out code at the release tag
   - Installs Node.js v22
   - Installs all npm dependencies (root, cdk, services, frontend)

3. **Infrastructure Deployment**
   - Deploys all CDK stacks using `cdk deploy --all`
   - Stacks deployed: DNSStack, DataStack, AuthStack, FrontendStack
   - Cross-region deployment (us-east-1 for certificates, eu-west-2 for resources)

4. **Frontend Build & Deploy**
   - Builds SvelteKit application
   - Retrieves S3 bucket name from CloudFormation outputs
   - Syncs built files to S3 bucket
   - Retrieves CloudFront distribution ID
   - Creates cache invalidation

5. **Summary**
   - Displays deployment summary with URLs
   - Shows release information

## Workflow Features

### Security
- ✅ **OIDC Authentication**: No long-lived AWS credentials
- ✅ **GitHub Environments**: Protected deployment environment
- ✅ **Minimal Permissions**: Only `id-token:write` and `contents:read`
- ✅ **Audit Trail**: All deployments logged in GitHub Actions

### Reliability
- ✅ **Error Handling**: Fails fast if resources can't be found
- ✅ **Dependency Management**: Proper npm caching
- ✅ **Regional Awareness**: Handles multi-region deployment
- ✅ **Idempotent**: Safe to re-run

### Efficiency
- ✅ **Single Job**: Deploys infrastructure and frontend together
- ✅ **Caching**: npm dependencies cached between runs
- ✅ **Parallel Operations**: Where possible

## Setting Up GitHub Environment

To set up the PRODUCTION environment:

1. Go to your GitHub repository
2. Settings → Environments → New environment
3. Name it **PRODUCTION**
4. Add environment secret:
   - Name: `AWS_ROLE_TO_ASSUME`
   - Value: Your IAM role ARN

Optional: Add protection rules
- Required reviewers (manual approval before deployment)
- Deployment branches (only allow main/production branches)

## Troubleshooting

### "Could not retrieve S3 bucket name"

**Cause:** Frontend stack not deployed or missing output
**Solution:** 
```bash
# Check stack exists
aws cloudformation describe-stacks --stack-name production-frontend-stack --region eu-west-2

# Redeploy if needed
cd cdk && cdk deploy FrontendStack
```

### "Role cannot be assumed"

**Cause:** OIDC trust relationship incorrect or role doesn't exist
**Solution:** Verify IAM role trust policy includes:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

### CDK Deploy Fails

**Cause:** Bootstrap not completed or insufficient permissions
**Solution:**
```bash
# Re-run bootstrap
./bootstrap.sh yourdomain.com

# Or manually bootstrap CDK
cdk bootstrap aws://ACCOUNT_ID/eu-west-2
cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

### CloudFront Invalidation Fails

**Cause:** Distribution ID not found or insufficient permissions
**Solution:** Verify CloudFront permissions in IAM role

## Cost Considerations

Each deployment incurs:
- **CloudFormation**: Free
- **S3 API calls**: ~$0.01 per deployment
- **CloudFront invalidations**: First 1,000 free per month, then $0.005 per path
- **Lambda deployments**: Free (covered by free tier)

**Estimated cost per deployment: < $0.05**

## Manual Deployment Alternative

If you need to deploy manually without creating a release:

```bash
# 1. Authenticate with AWS
aws sso login  # or aws configure

# 2. Deploy infrastructure
cd cdk
npm run deploy

# 3. Build and deploy frontend
cd ../frontend
npm run build

# Get bucket name and deploy
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name production-frontend-stack \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text --region eu-west-2)

aws s3 sync build/ "s3://$BUCKET_NAME/" --delete

# Invalidate cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name production-frontend-stack \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text --region eu-west-2)

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"
```

## Future Enhancements

Potential improvements to consider:

- [ ] Add staging environment workflow
- [ ] Add rollback mechanism
- [ ] Add smoke tests after deployment
- [ ] Add Slack/Discord notifications
- [ ] Add deployment approval steps
- [ ] Add blue/green deployment strategy
- [ ] Add automatic changelog generation

## Support

For issues:
- Check Actions logs in GitHub
- Review CloudFormation events in AWS Console
- See [DEPLOYMENT.md](../../DEPLOYMENT.md) for detailed deployment information
- See [BOOTSTRAP.md](../../BOOTSTRAP.md) for initial setup guide
