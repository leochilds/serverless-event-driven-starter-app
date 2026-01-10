# CORS Security Configuration

## Overview

The CORS (Cross-Origin Resource Sharing) configuration has been updated to follow security best practices by restricting API access to the specific frontend domain instead of allowing all origins (`*`).

## What Changed

### 1. Bootstrap Script (`bootstrap.sh`)
- Now extracts the frontend domain from the user-provided domain parameter
- Automatically configures `allowedOrigin` as `https://<domain>` in CDK context
- This value is used throughout the infrastructure deployment

### 2. CDK Auth Stack (`cdk/lib/stacks/auth-stack.ts`)
- Accepts a new `allowedOrigin` parameter in the stack props
- **API Gateway CORS**: Changed from `allowOrigins: ['*']` to `allowOrigins: [allowedOrigin]`
- **Lambda Environment Variables**: Added `ALLOWED_ORIGIN` to all Lambda functions

### 3. Lambda Handlers
Updated all three authentication handlers:
- `services/auth/src/handlers/signup.ts`
- `services/auth/src/handlers/login.ts`
- `services/auth/src/handlers/get-user.ts`

Changed from hardcoded `'Access-Control-Allow-Origin': '*'` to use the environment variable:
```typescript
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS', // or 'GET,OPTIONS'
};
```

### 4. CDK App Configuration (`cdk/bin/app.ts`)
- Reads `allowedOrigin` from CDK context
- Passes it to the AuthStack constructor

## Security Benefits

1. **Prevents CSRF Attacks**: Only requests from the specified domain are accepted
2. **Reduces Attack Surface**: Unauthorized domains cannot interact with the API
3. **Follows OWASP Guidelines**: Implements proper origin validation
4. **Maintains Functionality**: Legitimate requests from the frontend continue to work seamlessly

## Usage

When running the bootstrap script, the CORS origin is automatically configured based on the domain you provide:

```bash
./bootstrap.sh example.com
```

This will configure:
- **Frontend Domain**: `https://example.com`
- **API Domain**: `https://api.example.com`
- **Allowed CORS Origin**: `https://example.com`

## Testing

After deployment, you can verify the CORS configuration:

1. **From the Browser Console** (on your frontend domain):
```javascript
fetch('https://api.example.com/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test' })
})
.then(response => console.log(response))
```

2. **From a Different Domain** (should fail):
Try the same request from a different domain - it should be blocked by CORS policy.

3. **Using cURL** (bypasses CORS):
```bash
curl -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

## Migration Notes

If you have an existing deployment with the old permissive CORS configuration:

1. Run `./bootstrap.sh <your-domain>` to update the configuration
2. The CDK deployment will update:
   - API Gateway CORS settings
   - Lambda function environment variables
3. Changes take effect immediately after deployment
4. No changes required to the frontend code

## Additional Security Considerations

While this CORS configuration significantly improves security, consider also implementing:

1. **Rate Limiting**: Protect against brute force attacks
2. **API Keys**: For additional authentication layers
3. **WAF Rules**: AWS WAF can provide additional protection
4. **Request Validation**: Validate request payloads at the API Gateway level
5. **IP Whitelisting**: If your use case allows for it

## Support

For issues or questions about the CORS configuration, please refer to:
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment documentation
- [AWS CORS Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)
