# Bootstrap Script Guide

The bootstrap script (`bootstrap.sh`) automates the entire initial deployment process for the Serverless Event-Driven Starter App.

## Prerequisites

Before running the bootstrap script, ensure you have:

1. **AWS CLI** configured with valid credentials
   ```bash
   aws configure
   ```

2. **Required tools installed:**
   - Node.js (v22 or later)
   - npm
   - AWS CDK CLI (`npm install -g aws-cdk`)
   - jq (JSON processor)

3. **Route53 Hosted Zone** already created for your domain in AWS

## Usage

```bash
./bootstrap.sh <your-domain.com>
```

### Example

```bash
./bootstrap.sh example.com
```

This will configure the application with:
- Frontend: `https://example.com`
- API: `https://api.example.com`

## What the Script Does

The bootstrap script performs the following steps automatically:

### 1. Validation Phase
- ✅ Checks that a domain name was provided
- ✅ Verifies required tools are installed (aws, node, npm, jq, cdk)
- ✅ Validates AWS credentials are configured
- ✅ Confirms Route53 hosted zone exists for the domain

### 2. Configuration Phase
- ✅ Detects AWS account ID automatically
- ✅ Updates `cdk/cdk.json` with your domain configuration
- ✅ Creates a backup of the original configuration

### 3. Dependency Installation
- ✅ Runs `npm install` in the root directory
- ✅ Installs dependencies for all workspaces (cdk, services/auth, frontend)

### 4. CDK Bootstrap
- ✅ Bootstraps CDK in eu-west-2 (primary region)
- ✅ Bootstraps CDK in us-east-1 (certificate region)

### 5. Infrastructure Deployment
- ✅ Deploys DNS Stack (creates ACM certificates)
  - Certificate validation may take 5-10 minutes
- ✅ Deploys Data Stack (DynamoDB table)
- ✅ Deploys Frontend Stack (S3 + CloudFront)
- ✅ Deploys Auth Stack (Lambda + API Gateway)

### 6. Frontend Deployment
- ✅ Builds the SvelteKit frontend
- ✅ Retrieves S3 bucket name from CloudFormation
- ✅ Syncs built files to S3
- ✅ Retrieves CloudFront distribution ID
- ✅ Invalidates CloudFront cache

### 7. Summary Report
- ✅ Displays deployment summary with all URLs
- ✅ Shows CloudFormation stack outputs
- ✅ Provides next steps

## Estimated Time

Total deployment time: **15-20 minutes**

Breakdown:
- Validation & setup: 2-3 minutes
- CDK bootstrap: 3-5 minutes
- DNS Stack (ACM certificate validation): 5-10 minutes
- Other stacks: 5-8 minutes
- Frontend build & deploy: 2-3 minutes

## Script Output

The script provides color-coded output:
- 🔵 **Blue**: Step indicators and headers
- ✅ **Green**: Success messages
- ❌ **Red**: Error messages
- ℹ️ **Yellow**: Information messages

## Error Handling

The script will stop immediately if any error occurs (`set -e`). Common errors:

### "Domain name is required"
**Cause:** No domain provided to the script
**Solution:** Run with a domain: `./bootstrap.sh yourdomain.com`

### "Missing required tools"
**Cause:** One or more required CLI tools are not installed
**Solution:** Install the missing tools (aws, node, npm, jq, cdk)

### "AWS credentials are not configured or invalid"
**Cause:** AWS CLI is not configured or credentials are expired
**Solution:** Run `aws configure` and provide valid credentials

### "No Route53 hosted zone found"
**Cause:** The domain doesn't have a hosted zone in Route53
**Solution:** Create a hosted zone in Route53 for your domain first

### CDK Bootstrap Errors
**Cause:** Insufficient permissions or CDK already bootstrapped
**Solution:** Ensure your AWS user has administrator access, or skip bootstrap if already done

### Certificate Validation Timeout
**Cause:** DNS validation records not created or DNS not propagated
**Solution:** 
- Check Route53 has the correct nameservers
- Wait up to 30 minutes for DNS propagation
- Verify CNAME records were created by ACM

## Configuration Backup

The script creates a backup of your original CDK configuration:
- **Backup location:** `cdk/cdk.json.backup`
- **When created:** Before updating domain configuration

To restore the original configuration:
```bash
cp cdk/cdk.json.backup cdk/cdk.json
```

## Manual Intervention

If the script fails partway through, you can:

1. **Check the error message** to understand what failed
2. **Fix the issue** (e.g., create missing resources)
3. **Continue manually** from where it stopped:
   - If DNS stack failed: Deploy stacks manually with `cd cdk && cdk deploy`
   - If frontend deployment failed: Run the frontend deployment commands manually

## Post-Deployment

After the script completes:

1. **Wait for CloudFront propagation** (15-30 minutes)
2. **Visit your domain** to test the application
3. **Test the authentication flow**:
   - Sign up for an account
   - Log in with your credentials
   - View your dashboard

## Customization

To customize the bootstrap script:

### Change Regions
Edit these variables at the top of `bootstrap.sh`:
```bash
PRIMARY_REGION="eu-west-2"    # Your primary region
CERT_REGION="us-east-1"       # Certificate region (must stay us-east-1)
```

### Change Environment
Edit this variable:
```bash
ENVIRONMENT="production"      # Environment name
```

### Add Custom Validation
Add new functions to the "Validation Functions" section.

### Modify Deployment Order
Adjust the `deploy_stacks()` function to change deployment sequence.

## Troubleshooting

### Script Won't Execute
```bash
# Make the script executable
chmod +x bootstrap.sh
```

### jq Not Found
```bash
# Install jq
# Ubuntu/Debian:
sudo apt-get install jq

# macOS:
brew install jq
```

### CDK Not Found
```bash
# Install AWS CDK globally
npm install -g aws-cdk
```

### Permission Denied Errors
Ensure your AWS IAM user/role has sufficient permissions:
- CloudFormation: Full access
- Route53: Full access
- S3: Full access
- CloudFront: Full access
- Lambda: Full access
- API Gateway: Full access
- DynamoDB: Full access
- Secrets Manager: Full access
- ACM: Full access
- IAM: Create roles and policies

## Clean Up

To remove all resources created by the bootstrap script:

```bash
cd cdk
npm run destroy
```

⚠️ **Warning:** This will delete all resources, including data in DynamoDB.

## Support

For issues or questions:
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment information
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system architecture
- See [README.md](./README.md) for general information

## Script Source

The bootstrap script is located at: `bootstrap.sh`

To view the script:
```bash
cat bootstrap.sh
```

To edit the script:
```bash
nano bootstrap.sh
# or
vim bootstrap.sh
```
