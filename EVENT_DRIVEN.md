# Event-Driven Architecture Guide

This application demonstrates both **synchronous REST API** patterns (for authentication) and **asynchronous event-driven** patterns (for notes) in a serverless architecture.

## Architecture Overview

### Traditional Synchronous Pattern (Auth)
```
User → API Gateway → Lambda → DynamoDB → Response
```
- **Use Case**: Operations requiring immediate response (auth, login)
- **Advantage**: Simple, guaranteed response
- **Limitation**: Doesn't scale well under load, couples components

### Event-Driven Asynchronous Pattern (Notes)
```
User → API Gateway → Lambda (publish) → EventBridge → SQS → Lambda (save) → DynamoDB
                                              ↓
                                         WebSocket ← Lambda (notify)
```
- **Use Case**: Operations that can be processed asynchronously (notes, uploads, processing)
- **Advantage**: Highly scalable, decoupled, resilient
- **Trade-off**: Eventual consistency, more complex

## Event Flow

### Creating a Note

1. **User submits note** via HTTP POST `/notes`
2. **publish-note Lambda** validates request and publishes `note-created` event to EventBridge
3. **HTTP response** returns immediately (202 Accepted) - user doesn't wait!
4. **EventBridge** routes event to SQS queue based on event rules
5. **SQS** buffers events, handles retries, provides DLQ for failures
6. **save-note Lambda** triggered by SQS, saves to DynamoDB
7. **save-note Lambda** publishes `note-saved` or `note-failed` event
8. **EventBridge** routes result event to notify Lambda
9. **notify Lambda** sends message to user's WebSocket connections
10. **Frontend** receives real-time notification and updates UI

### Event Types

#### note-created
```json
{
  "eventType": "note-created",
  "noteId": "string",
  "username": "string",
  "content": "string",
  "isPublic": boolean,
  "timestamp": "ISO8601"
}
```

#### note-saved
```json
{
  "eventType": "note-saved",
  "noteId": "string",
  "username": "string",
  "content": "string",
  "isPublic": boolean,
  "savedAt": "ISO8601",
  "timestamp": "ISO8601"
}
```

#### note-failed
```json
{
  "eventType": "note-failed",
  "noteId": "string",
  "username": "string",
  "error": "string",
  "timestamp": "ISO8601"
}
```

#### note-updated
```json
{
  "eventType": "note-updated",
  "noteId": "string",
  "username": "string",
  "content": "string",
  "updatedAt": "ISO8601",
  "timestamp": "ISO8601"
}
```

#### note-deleted
```json
{
  "eventType": "note-deleted",
  "noteId": "string",
  "username": "string",
  "deletedAt": "ISO8601",
  "timestamp": "ISO8601"
}
```

## Infrastructure Components

### EventBridge Event Bus
- **Purpose**: Central event router
- **Benefit**: Decouples event producers from consumers
- **Cost**: $1 per million events

### SQS Queue
- **Purpose**: Buffer events, provide retry mechanism
- **Configuration**:
  - Visibility timeout: 30 seconds
  - Long polling: 20 seconds
  - Dead Letter Queue: 3 max receives
- **Cost**: First 1M requests free, then $0.40/million

### WebSocket API
- **Purpose**: Real-time bidirectional communication
- **Connection Management**: DynamoDB table tracks active connections
- **Authentication**: JWT token passed in query string
- **Cost**: $1/million messages + $0.25/million connection minutes

### Lambda Functions

#### Notes Service
- `publish-note`: Publishes events to EventBridge
- `save-note`: Consumes SQS, saves to DynamoDB
- `get-notes`: Returns user's private notes
- `get-public-notes`: Returns all public notes
- `update-note`: Updates note, publishes event
- `delete-note`: Deletes note, publishes event

#### WebSocket Service
- `connect`: Stores WebSocket connection
- `disconnect`: Removes WebSocket connection
- `notify`: Sends events to connected clients

## DynamoDB Schema

### Notes (Private)
```
pk: "USER#{username}"
sk: "NOTE#{timestamp}#{noteId}"
attributes: {
  noteId, content, isPublic: false,
  status, createdAt, savedAt
}
```

### Notes (Public)
```
pk: "PUBLIC#NOTES"
sk: "NOTE#{timestamp}#{noteId}"
attributes: {
  noteId, username, content, isPublic: true,
  status, createdAt, savedAt
}
```

### WebSocket Connections
```
pk: "CONNECTION#{connectionId}"
sk: "META"
attributes: { connectionId, username, connectedAt, ttl }

pk: "USER#{username}"
sk: "CONNECTION#{connectionId}"
attributes: { connectionId, username, connectedAt, ttl }
```

## Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Deploy Infrastructure
```bash
cd cdk
npm run deploy
```

This deploys all stacks:
- `EventStack`: EventBridge + SQS
- `WebSocketStack`: WebSocket API + connections table
- `NotesStack`: Notes Lambda functions + API routes

### 3. Update Frontend with WebSocket URL

After deployment, get the WebSocket URL from stack outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name production-websocket-stack \
  --query "Stacks[0].Outputs[?OutputKey=='WebSocketUrl'].OutputValue" \
  --output text
```

Update `frontend/src/routes/dashboard/+page.svelte`:
```typescript
const WS_URL = 'wss://YOUR_WEBSOCKET_ID.execute-api.eu-west-2.amazonaws.com/production';
```

### 4. Build and Deploy Frontend
```bash
cd frontend
npm run build

# Upload to S3
aws s3 sync build/ s3://YOUR_BUCKET_NAME/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## Testing

### Test Note Creation (Async)
```bash
# Create a note
curl -X POST https://api.leochilds.uk/notes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is an event-driven note!",
    "isPublic": true
  }'

# Response: 202 Accepted (immediate)
{
  "message": "Note submitted for processing",
  "noteId": "1234567890-abc123",
  "status": "pending"
}

# WebSocket receives notification when saved
```

### Test Note Retrieval
```bash
# Get your notes
curl https://api.leochilds.uk/notes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get public notes
curl https://api.leochilds.uk/notes/public
```

### Monitor Events

Check CloudWatch Logs for each Lambda:
```bash
# View publish-note logs
aws logs tail /aws/lambda/production-notes-publish --follow

# View save-note logs
aws logs tail /aws/lambda/production-notes-save --follow

# View notify logs
aws logs tail /aws/lambda/production-websocket-notify --follow
```

### Monitor SQS Queue
```bash
# Check queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.eu-west-2.amazonaws.com/ACCOUNT/production-note-processing-queue \
  --attribute-names ApproximateNumberOfMessages

# Check DLQ
aws sqs get-queue-attributes \
  --queue-url https://sqs.eu-west-2.amazonaws.com/ACCOUNT/production-note-processing-dlq \
  --attribute-names ApproximateNumberOfMessages
```

## Benefits of Event-Driven Architecture

### 1. **Scalability**
- SQS buffers traffic spikes
- Each Lambda scales independently
- No bottlenecks in processing pipeline

### 2. **Resilience**
- Failed messages go to DLQ for investigation
- Automatic retries (3 attempts)
- Service failures don't cascade

### 3. **Flexibility**
- Easy to add new event consumers
- No code changes to producers
- Can replay events from DLQ

### 4. **Decoupling**
- Services don't depend on each other
- Can deploy services independently
- Easier to maintain and debug

### 5. **Real-time Updates**
- WebSocket provides instant feedback
- Better user experience
- No polling required

## Comparison: Sync vs Async

| Aspect | Synchronous (Auth) | Asynchronous (Notes) |
|--------|-------------------|----------------------|
| Response Time | Immediate | Eventual |
| Scalability | Limited by Lambda concurrency | High (buffered by SQS) |
| Coupling | Tight | Loose |
| Retry Logic | Manual | Automatic (SQS) |
| Error Handling | Try/catch in Lambda | DLQ + monitoring |
| User Experience | Blocking | Non-blocking + real-time |
| Cost | Pay per request | Pay per request + events |
| Complexity | Low | Medium |
| Best For | Auth, critical reads | Processing, workflows |

## When to Use Each Pattern

### Use Synchronous (REST) When:
- User needs immediate response
- Operation is fast (< 100ms)
- Strong consistency required
- Simple CRUD operations

### Use Asynchronous (Events) When:
- Operation takes time (> 100ms)
- High traffic expected
- Eventual consistency acceptable
- Multiple downstream actions needed
- Resilience is critical

## Monitoring and Observability

### CloudWatch Metrics
- Lambda invocations, duration, errors
- SQS messages sent, received, deleted
- EventBridge events matched, failed
- WebSocket messages sent, connection count

### CloudWatch Alarms (Recommended)
```bash
# High SQS queue depth
aws cloudwatch put-metric-alarm \
  --alarm-name notes-queue-depth-high \
  --metric-name ApproximateNumberOfMessages \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold

# Messages in DLQ
aws cloudwatch put-metric-alarm \
  --alarm-name notes-dlq-messages \
  --metric-name ApproximateNumberOfMessages \
  --namespace AWS/SQS \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold
```

### X-Ray Tracing (Optional)
Enable for end-to-end request tracing:
```typescript
// In Lambda functions
import { captureAWSv3Client } from 'aws-xray-sdk-core';
const client = captureAWSv3Client(new EventBridgeClient({}));
```

## Troubleshooting

### Notes not saving
1. Check EventBridge logs: Are events being published?
2. Check SQS queue depth: Are messages piling up?
3. Check save-note Lambda logs: Any errors?
4. Check DLQ: Any failed messages?

### WebSocket not connecting
1. Check token is valid (not expired)
2. Check WebSocket URL is correct
3. Check connect Lambda logs for errors
4. Verify connections table has entry

### Real-time updates not working
1. Check WebSocket is connected
2. Check notify Lambda is being triggered
3. Check connections table has valid entries
4. Verify EventBridge rules are routing events

## Future Enhancements

- [ ] Add Step Functions for complex workflows
- [ ] Add SNS for fanout patterns
- [ ] Add DynamoDB Streams for change data capture
- [ ] Add API Gateway caching
- [ ] Add rate limiting with API Gateway
- [ ] Add batch processing for bulk operations
- [ ] Add saga pattern for distributed transactions
- [ ] Add event sourcing for audit trails

## Cost Optimization

1. **Use on-demand DynamoDB** for unpredictable traffic
2. **Set SQS visibility timeout** appropriately to avoid duplicate processing
3. **Use Lambda reserved concurrency** to control costs
4. **Enable CloudWatch Logs retention** policies (7 days recommended)
5. **Use WebSocket connection TTL** to clean up stale connections
6. **Monitor DLQ** and fix issues to avoid reprocessing costs

## Security Best Practices

1. **JWT validation** in WebSocket connect handler
2. **IAM least privilege** for Lambda execution roles
3. **Encrypt SQS queues** with AWS KMS
4. **Enable EventBridge event archiving** for audit
5. **Use VPC endpoints** for DynamoDB access (if needed)
6. **Enable CloudTrail** for API call auditing

## Conclusion

This event-driven architecture demonstrates how to build scalable, resilient serverless applications. By combining synchronous and asynchronous patterns, you get the best of both worlds: immediate responses when needed, and scalable processing for everything else.

The real-time WebSocket integration provides an excellent user experience, while the event-driven backend ensures reliability and scalability.

Happy building! 🚀
