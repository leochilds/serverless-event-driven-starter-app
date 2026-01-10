# Architecture Documentation

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│                    https://leochilds.uk                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Route53 (DNS)                                    │
│                    A Record → CloudFront                            │
│                    A Record → API Gateway                           │
└──────────────────┬──────────────────────────┬───────────────────────┘
                   │                          │
        Frontend   │                          │  Backend API
                   ▼                          ▼
    ┌──────────────────────────┐  ┌──────────────────────────┐
    │   CloudFront (CDN)       │  │  API Gateway (HTTP API)  │
    │   us-east-1 Certificate  │  │  api.leochilds.uk        │
    │   - HTTPS only           │  │  - CORS enabled          │
    │   - SPA routing          │  │  - Custom domain         │
    │   - Cache optimization   │  │  - us-east-1 cert        │
    └──────────┬───────────────┘  └──────────┬───────────────┘
               │                              │
               │ OAC                          │ Lambda Integration
               ▼                              ▼
    ┌──────────────────────────┐  ┌──────────────────────────┐
    │   S3 Bucket              │  │   Lambda Functions       │
    │   - Static site files    │  │   - signup.ts            │
    │   - SvelteKit build      │  │   - login.ts             │
    │   - Private bucket       │  │   - get-user.ts          │
    └──────────────────────────┘  └──────────┬───────────────┘
                                              │
                                   ┌──────────┼──────────┐
                                   │          │          │
                    ┌──────────────▼──┐   ┌──▼──────────▼───────┐
                    │  Secrets Manager│   │   DynamoDB          │
                    │  - JWT Secret   │   │   - Users table     │
                    │  - Auto-rotation│   │   - Single-table    │
                    │                 │   │   - 1 RCU/WCU       │
                    └─────────────────┘   └─────────────────────┘
```

## Stack Dependencies

```
DNS Stack (us-east-1)
    │
    ├─────────────┐
    │             │
    ▼             ▼
Data Stack    Frontend Stack
(eu-west-2)   (eu-west-2 + CloudFront)
    │
    │
    ▼
Auth Stack
(eu-west-2)
```

## Multi-Region Setup

### Region: us-east-1 (Certificate Region)
- **DNS Stack**
  - ACM Certificate for `leochilds.uk` (Frontend)
  - ACM Certificate for `api.leochilds.uk` (API)
  - Route53 Hosted Zone (imported)

### Region: eu-west-2 (Primary Region)
- **Data Stack**
  - DynamoDB Table: `production-data-table`
  
- **Auth Stack**
  - Lambda Functions: signup, login, get-user
  - API Gateway: HTTP API with custom domain
  - Secrets Manager: JWT secret
  
- **Frontend Stack**
  - S3 Bucket: Static files
  - CloudFront Distribution (edge locations globally)

## Data Flow

### User Signup Flow
```
1. User fills signup form → Frontend
2. POST /auth/signup → API Gateway
3. API Gateway → signup Lambda
4. Lambda:
   - Hash password (scrypt)
   - Check if user exists (DynamoDB)
   - Create user record (DynamoDB)
5. Response → User created
```

### User Login Flow
```
1. User fills login form → Frontend
2. POST /auth/login → API Gateway
3. API Gateway → login Lambda
4. Lambda:
   - Get user from DynamoDB
   - Verify password (scrypt)
   - Get JWT secret from Secrets Manager
   - Generate JWT token
5. Response → JWT token
6. Frontend stores token in localStorage
```

### Protected Resource Access
```
1. User requests dashboard → Frontend
2. GET /auth/user (Bearer token) → API Gateway
3. API Gateway → get-user Lambda
4. Lambda:
   - Extract JWT from header
   - Get JWT secret from Secrets Manager
   - Verify JWT signature
   - Get user from DynamoDB
   - Remove sensitive fields
5. Response → User data
6. Frontend displays dashboard
```

## Security Architecture

### Password Security
```
Plain Password
    │
    ▼
Random 32-byte Salt
    │
    ▼
scrypt (CPU/Memory intensive)
    │
    ▼
64-byte Derived Key
    │
    ▼
Store: salt:hash (base64)
```

### JWT Token Flow
```
Login Success
    │
    ▼
Get Secret from Secrets Manager (cached)
    │
    ▼
jwt.sign({ username }, secret, { expiresIn: '24h' })
    │
    ▼
Return Token to Client
    │
    ▼
Client stores in localStorage
    │
    ▼
Include in Authorization: Bearer <token>
    │
    ▼
Lambda verifies signature
```

## DynamoDB Schema

### Single-Table Design

```
Table: production-data-table
Partition Key: pk (String)
Sort Key: sk (String)
```

#### Access Patterns

| Entity | PK | SK | Attributes |
|--------|----|----|------------|
| User Profile | `USER#{username}` | `PROFILE` | username, passwordHash, createdAt |

**Future Extensions:**
- Sessions: `USER#{username}` / `SESSION#{sessionId}`
- Refresh Tokens: `USER#{username}` / `REFRESH#{tokenId}`
- User Settings: `USER#{username}` / `SETTINGS`

## IAM Permissions

### Lambda Execution Roles

**Signup Function:**
- `dynamodb:GetItem` on table (check existence)
- `dynamodb:PutItem` on table (create user)

**Login Function:**
- `dynamodb:GetItem` on table (get user)
- `secretsmanager:GetSecretValue` on JWT secret

**Get-User Function:**
- `dynamodb:GetItem` on table (get user)
- `secretsmanager:GetSecretValue` on JWT secret

### S3 Bucket Policy
- CloudFront OAC can `s3:GetObject`
- No public access

## Cost Breakdown

### Monthly Costs (Estimated)

| Service | Configuration | Cost |
|---------|--------------|------|
| DynamoDB | 1 RCU, 1 WCU provisioned | $0.53 |
| Lambda | 1M requests, 256MB, 500ms avg | Free tier |
| API Gateway | HTTP API, 1M requests | Free tier |
| CloudFront | 1TB data transfer, 10M requests | Free tier |
| S3 | <1GB storage, minimal requests | $0.10 |
| Secrets Manager | 1 secret | $0.40 |
| Route53 | 1 hosted zone | $0.50 |
| ACM | 2 certificates | Free |
| **Total** | | **~$1.53/month** |

### Scaling Considerations

As traffic grows:
- **Lambda**: Charged per request and duration
- **API Gateway**: $1 per million requests after free tier
- **CloudFront**: $0.085 per GB after 1TB
- **DynamoDB**: Consider on-demand pricing for unpredictable traffic

## Performance Optimizations

### Frontend
- Static site generation (pre-rendered HTML)
- CloudFront edge caching (global CDN)
- Compressed assets (gzip/brotli)
- HTTP/2 enabled

### Backend
- Lambda warm start optimization (code structure)
- Secrets Manager caching (in-memory)
- DynamoDB single-table design (efficient queries)
- API Gateway HTTP API (lower latency than REST API)

### Database
- Partition key design for even distribution
- Sort key for efficient queries
- Point-in-time recovery enabled
- Minimal provisioned capacity (cost-optimized)

## Monitoring & Observability

### CloudWatch Metrics (Auto-created)
- Lambda: Invocations, Duration, Errors, Throttles
- API Gateway: Request count, Latency, 4XX/5XX errors
- DynamoDB: Consumed capacity, Throttles
- CloudFront: Requests, Bytes transferred, Error rate

### CloudWatch Logs
- Lambda function logs (7-day retention)
- API Gateway access logs (optional)

### Recommended Alarms
- Lambda error rate > 1%
- API Gateway 5XX errors > 10
- DynamoDB throttling events
- CloudFront 5XX error rate > 1%

## Disaster Recovery

### Backup Strategy
- **DynamoDB**: Point-in-time recovery (35 days)
- **S3**: Versioning enabled (optional)
- **Secrets**: Automatic replication to backup region

### Recovery Procedures
1. **Data Loss**: Restore DynamoDB from PITR
2. **Stack Deletion**: Redeploy from source code (IaC)
3. **Secret Compromise**: Rotate secrets via Secrets Manager
4. **Regional Outage**: Deploy to alternate region

## Extensibility

### Adding New Stacks
1. Create stack class in `cdk/lib/stacks/`
2. Add to `cdk/bin/app.ts`
3. Set proper dependencies
4. Deploy with `cdk deploy <StackName>`

### Adding New Lambda Functions
1. Create handler in `services/*/src/handlers/`
2. Add NodejsFunction in relevant stack
3. Configure IAM permissions
4. Add API Gateway route

### Adding New Frontend Routes
1. Create `+page.svelte` in `frontend/src/routes/`
2. Rebuild: `npm run build`
3. Deploy to S3
4. Invalidate CloudFront

## Development Workflow

```
1. Make code changes
2. Test locally (optional)
3. Commit to git
4. Deploy infrastructure: cdk deploy
5. Build frontend: npm run build
6. Deploy frontend: aws s3 sync
7. Invalidate cache: aws cloudfront create-invalidation
8. Test in production
```

## Best Practices Implemented

✅ Infrastructure as Code (CDK)  
✅ Multi-region support  
✅ Least privilege IAM  
✅ Secrets management  
✅ Single-table DynamoDB design  
✅ Stateless Lambda functions  
✅ HTTPS everywhere  
✅ CORS properly configured  
✅ Cost-optimized resources  
✅ Environment tagging  
✅ TypeScript throughout  
✅ npm workspaces for monorepo  

## Future Enhancements

- Add EventBridge for event routing
- Add SQS for async processing
- Add Step Functions for workflows
- Add CloudWatch dashboards
- Add CI/CD pipeline
- Add automated testing
- Add API versioning
- Add rate limiting
- Add WAF for security
