# Deployment Guide

This guide will walk you through deploying the serverless event-driven starter application to AWS.

## Prerequisites

1. **AWS CLI** configured with credentials
   ```bash
   aws configure
   ```

2. **Node.js** (v20 or later)
3. **npm** (comes with Node.js)
4. **AWS CDK CLI** installed globally
   ```bash
   npm install -g aws-cdk
   ```

5. **Route53 Hosted Zone** for `leochilds.uk` already created in your AWS account

## Project Structure

```
├── cdk/                    # AWS CDK infrastructure
├── services/auth/          # Authentication service Lambda functions
├── frontend/              # SvelteKit frontend application
└── package.json           # Root workspace configuration
```

## Deployment Steps

### 1. Install Dependencies

From the root directory:

```bash
npm install
```

This will install dependencies for all workspaces (cdk, services/auth, frontend).

### 2. Bootstrap CDK (First Time Only)

Bootstrap CDK in both regions:

```bash
# Bootstrap primary region (eu-west-2)
cdk bootstrap aws://YOUR_ACCOUNT_ID/eu-west-2

# Bootstrap certificate region (us-east-1)
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID.

### 3. Deploy Infrastructure

Deploy all stacks in the correct order:

```bash
cd cdk
npm run deploy
```

This will deploy:
1. **DNS Stack** - Creates ACM certificates in us-east-1 (takes ~5-10 minutes for DNS validation)
2. **Data Stack** - Creates DynamoDB table in eu-west-2
3. **Auth Stack** - Creates Lambda functions, API Gateway, and custom domain
4. **Frontend Stack** - Creates S3 bucket, CloudFront distribution

**Note:** The DNS Stack deployment will wait for ACM certificate validation. Ensure your Route53 hosted zone is properly configured.

### 4. Build and Deploy Frontend

After infrastructure is deployed:

```bash
# Build the frontend
cd ../frontend
npm run build

# Upload to S3 (get bucket name from stack outputs)
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name production-frontend-stack --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text --region eu-west-2)

aws s3 sync build/ s3://$BUCKET_NAME/ --delete

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name production-frontend-stack --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text --region eu-west-2)

aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
```

### 5. Verify Deployment

Check the CloudFormation stack outputs:

```bash
# DNS Stack outputs
aws cloudformation describe-stacks --stack-name production-dns-stack --region us-east-1

# Data Stack outputs
aws cloudformation describe-stacks --stack-name production-data-stack --region eu-west-2

# Auth Stack outputs
aws cloudformation describe-stacks --stack-name production-auth-stack --region eu-west-2

# Frontend Stack outputs
aws cloudformation describe-stacks --stack-name production-frontend-stack --region eu-west-2
```

## Post-Deployment

### Testing the API

1. **Signup**:
   ```bash
   curl -X POST https://api.leochilds.uk/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpassword"}'
   ```

2. **Login**:
   ```bash
   curl -X POST https://api.leochilds.uk/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"testpassword"}'
   ```

3. **Get User** (use token from login response):
   ```bash
   curl -X GET https://api.leochilds.uk/auth/user \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

### Testing the Frontend

Visit `https://leochilds.uk` in your browser. You should see:
- Home page with welcome message
- Sign up page to create an account
- Login page to authenticate
- Dashboard page (requires authentication)

## CloudFront Propagation

**Note:** CloudFront distributions can take 15-30 minutes to fully propagate globally. During this time, the frontend may not be accessible at the custom domain.

## Troubleshooting

### Certificate Validation Stuck

If ACM certificate validation is taking too long:
1. Check Route53 hosted zone has the correct name servers
2. Ensure DNS validation CNAME records were created
3. Wait up to 30 minutes for DNS propagation

### API Gateway 403 Errors

If you get 403 errors when accessing the API:
1. Check the custom domain mapping is correct
2. Verify the certificate is issued and attached
3. Check Route53 A record points to API Gateway

### Frontend Not Loading

1. Verify S3 bucket contains the built files
2. Check CloudFront distribution status (must be "Deployed")
3. Invalidate CloudFront cache
4. Verify Route53 A record points to CloudFront

## Updating the Application

### Update Lambda Functions

```bash
cd cdk
cdk deploy AuthStack
```

### Update Frontend

```bash
cd frontend
npm run build

# Sync to S3
aws s3 sync build/ s3://$BUCKET_NAME/ --delete

# Invalidate cache
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
```

### Update Infrastructure

```bash
cd cdk
cdk deploy --all
```

## Cleanup/Destruction

To remove all resources:

```bash
cd cdk
npm run destroy
```

**Warning:** This will delete:
- All Lambda functions
- API Gateway
- DynamoDB table (if RemovalPolicy allows)
- S3 bucket contents
- CloudFront distribution
- Secrets Manager secrets

The Route53 hosted zone will NOT be deleted.

## Cost Estimates

With minimal usage (demo purposes):
- **DynamoDB**: ~$0.53/month (1 RCU/WCU)
- **Lambda**: Free tier (1M requests/month)
- **API Gateway**: Free tier (1M requests/month)
- **CloudFront**: Free tier (1TB/month, 10M requests)
- **S3**: ~$0.10/month (minimal storage)
- **Secrets Manager**: ~$0.40/month per secret
- **Route53**: ~$0.50/month per hosted zone
- **ACM Certificates**: Free

**Total: ~$1-2/month** for a demo application with minimal traffic.

## Multi-Environment Setup

To create additional environments (e.g., staging, dev):

1. Update `cdk.json` context:
   ```json
   {
     "environment": "staging",
     "domainName": "staging.leochilds.uk",
     "apiDomainName": "api-staging.leochilds.uk"
   }
   ```

2. Deploy with context:
   ```bash
   cdk deploy --all -c environment=staging
   ```

## Support

For issues or questions, refer to:
- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- SvelteKit Documentation: https://kit.svelte.dev/
