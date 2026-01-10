# Serverless Event-Driven Starter App

A production-ready starter template for building serverless, event-driven applications using AWS CDK, TypeScript, and SvelteKit.

## 🏗️ Architecture Overview

This starter application demonstrates a modern serverless architecture with:

- **Frontend**: SvelteKit static site hosted on S3 + CloudFront
- **Backend**: AWS Lambda functions with API Gateway
- **Database**: DynamoDB (single-table design)
- **Authentication**: JWT-based auth with bcrypt password hashing
- **Infrastructure**: AWS CDK for infrastructure as code
- **Multi-Region**: Supports resources across multiple AWS regions

## 📦 Project Structure

```
├── cdk/                          # AWS CDK Infrastructure
│   ├── bin/
│   │   └── app.ts               # CDK app entry point
│   ├── lib/stacks/
│   │   ├── dns-stack.ts         # Route53 + ACM certificates
│   │   ├── data-stack.ts        # DynamoDB table
│   │   ├── auth-stack.ts        # Lambda + API Gateway
│   │   └── frontend-stack.ts    # S3 + CloudFront
│   └── package.json
│
├── services/
│   └── auth/                     # Authentication Service
│       ├── src/
│       │   ├── handlers/        # Lambda function handlers
│       │   │   ├── signup.ts
│       │   │   ├── login.ts
│       │   │   └── get-user.ts
│       │   └── utils/           # Shared utilities
│       │       ├── crypto.ts    # Password hashing
│       │       └── jwt.ts       # JWT token management
│       └── package.json
│
├── frontend/                     # SvelteKit Frontend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte           # Home page
│   │   │   ├── signup/+page.svelte    # Sign up
│   │   │   ├── login/+page.svelte     # Login
│   │   │   └── dashboard/+page.svelte # Dashboard
│   │   ├── app.html
│   │   └── app.css
│   └── package.json
│
├── package.json                  # Root workspace config
├── DEPLOYMENT.md                # Deployment guide
└── README.md                    # This file
```

## 🚀 Features

### Infrastructure Stacks

#### 1. DNS Stack
- Route53 hosted zone integration
- ACM SSL/TLS certificates for custom domains
- Deployed in `us-east-1` (required for CloudFront)

#### 2. Data Stack
- DynamoDB table with single-table design
- Partition key: `pk`, Sort key: `sk`
- Minimal provisioned capacity (1 RCU/WCU) for cost optimization
- Point-in-time recovery enabled

#### 3. Auth Service Stack
- Three Lambda functions (signup, login, get-user)
- API Gateway HTTP API with custom domain
- Secrets Manager for JWT secret storage
- Secure password hashing with Node.js crypto (scrypt)
- JWT token generation and validation
- CORS enabled for frontend integration

#### 4. Frontend Stack
- S3 bucket for static website hosting
- CloudFront distribution with custom domain
- Origin Access Control (OAC) for secure S3 access
- SPA routing support (404 → index.html)
- Route53 A/AAAA records

### Security Features

- ✅ Password hashing with scrypt (32-byte salt, 64-byte key)
- ✅ JWT tokens with 24-hour expiration
- ✅ HTTPS only (via ACM certificates)
- ✅ Secrets stored in AWS Secrets Manager
- ✅ IAM least privilege permissions
- ✅ CloudFront HTTPS enforcement

### Frontend Features

- ✅ User registration (signup)
- ✅ User authentication (login)
- ✅ Protected dashboard with user data
- ✅ JWT token storage (localStorage)
- ✅ Automatic token validation
- ✅ Logout functionality
- ✅ Responsive design with clean UI

## 🛠️ Technology Stack

### Backend
- **Language**: TypeScript
- **Runtime**: Node.js 20.x
- **Compute**: AWS Lambda
- **API**: API Gateway (HTTP API)
- **Database**: DynamoDB
- **Auth**: JWT + scrypt password hashing
- **Secrets**: AWS Secrets Manager
- **Infrastructure**: AWS CDK v2

### Frontend
- **Framework**: SvelteKit
- **Language**: TypeScript
- **Build**: Vite
- **Adapter**: Static adapter (SSG)
- **Hosting**: S3 + CloudFront

### DevOps
- **IaC**: AWS CDK (TypeScript)
- **Regions**: eu-west-2 (primary), us-east-1 (certificates)
- **Package Manager**: npm workspaces
- **Deployment**: AWS CLI + CDK CLI

## 📋 Prerequisites

- **AWS Account** with CLI configured
- **Node.js** v20 or later
- **AWS CDK CLI** (`npm install -g aws-cdk`)
- **Route53 Hosted Zone** for your domain

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd serverless-event-driven-starter-app
npm install
```

### 2. Configure Your Domain

Update `cdk/cdk.json` with your domain:

```json
{
  "context": {
    "domainName": "yourdomain.com",
    "apiDomainName": "api.yourdomain.com"
  }
}
```

### 3. Deploy Infrastructure

```bash
cd cdk
npm run deploy
```

### 4. Build and Deploy Frontend

```bash
cd ../frontend
npm run build

# Get bucket name from stack output
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name production-frontend-stack --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text --region eu-west-2)

# Upload to S3
aws s3 sync build/ s3://$BUCKET_NAME/ --delete

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name production-frontend-stack --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text --region eu-west-2)
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
```

### 5. Test the Application

Visit your domain (e.g., `https://yourdomain.com`) and test:
- Sign up with a username and password
- Login with your credentials
- View dashboard with user data

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 🏗️ Architectural Patterns

### Single-Table DynamoDB Design

Users are stored with the following pattern:
```
pk: "USER#{username}"
sk: "PROFILE"
attributes: { username, passwordHash, createdAt }
```

This allows for efficient queries and follows single-table design best practices.

### Event-Driven Architecture

While this starter demonstrates basic CRUD operations, the architecture is designed to be extended with:
- EventBridge for event routing
- SQS for async processing
- Step Functions for orchestration
- Additional Lambda functions as event handlers

### Multi-Environment Support

The stacks are environment-aware and can be deployed to multiple environments:

```bash
cdk deploy --all -c environment=staging
```

All resources are tagged with the environment for cost tracking and organization.

## 💰 Cost Optimization

This starter is optimized for minimal AWS costs:

- **DynamoDB**: 1 RCU/WCU provisioned (~$0.53/month)
- **Lambda**: Free tier eligible (1M requests/month)
- **API Gateway**: Free tier eligible (1M requests/month)
- **CloudFront**: Free tier eligible (1TB transfer, 10M requests)
- **S3**: Minimal storage costs
- **Secrets Manager**: ~$0.40/month per secret
- **Route53**: ~$0.50/month per hosted zone

**Estimated monthly cost: $1-2 for demo/development usage**

## 🔐 Security Best Practices

1. **Passwords**: Hashed with scrypt (CPU/memory intensive algorithm)
2. **Secrets**: Stored in AWS Secrets Manager (not in code)
3. **JWT**: Short-lived tokens (24h expiration)
4. **HTTPS**: Enforced via CloudFront and ACM certificates
5. **CORS**: Properly configured for frontend domain
6. **IAM**: Least privilege permissions for Lambda functions
7. **S3**: Not publicly accessible (CloudFront OAC only)

## 📚 API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/signup` | Create new user account | No |
| POST | `/auth/login` | Authenticate user, get JWT | No |
| GET | `/auth/user` | Get user profile data | Yes (JWT) |

## 🧪 Testing

### API Testing with curl

```bash
# Signup
curl -X POST https://api.yourdomain.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"password123"}'

# Login
TOKEN=$(curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"password123"}' | jq -r '.token')

# Get user
curl -X GET https://api.yourdomain.com/auth/user \
  -H "Authorization: Bearer $TOKEN"
```

## 🔄 Extending the Application

This starter provides a foundation for building serverless applications. Consider extending it with:

### Additional Features
- Email verification
- Password reset functionality
- User profile updates
- Multi-factor authentication (MFA)
- Social login (OAuth)

### Additional Services
- **Notification Service**: SNS + SES for emails
- **File Upload Service**: S3 presigned URLs
- **Analytics Service**: EventBridge + Kinesis
- **Search Service**: OpenSearch
- **Caching**: ElastiCache or DynamoDB DAX

### Additional Stacks
- **Monitoring Stack**: CloudWatch dashboards + alarms
- **CI/CD Stack**: CodePipeline for automated deployments
- **Backup Stack**: Automated backups and disaster recovery

## 🐛 Troubleshooting

See [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) for common issues and solutions.

## 📖 Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Detailed deployment instructions
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [SvelteKit Documentation](https://kit.svelte.dev/)

## 📝 License

MIT License - See [LICENSE](./LICENSE) file for details

## 🤝 Contributing

This is a starter template. Feel free to fork and customize for your needs!

## ⭐ Key Takeaways

This starter demonstrates:
1. ✅ Multi-stack CDK architecture with proper dependencies
2. ✅ Multi-region resource deployment
3. ✅ Single-table DynamoDB design
4. ✅ Serverless authentication with JWT
5. ✅ Static site hosting with CloudFront
6. ✅ Infrastructure as code best practices
7. ✅ TypeScript throughout the stack
8. ✅ Cost-optimized resource configuration
9. ✅ Security best practices
10. ✅ Environment-aware deployments

Use this as a foundation for building production-ready serverless applications! 🚀
