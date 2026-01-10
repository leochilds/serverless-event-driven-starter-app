#!/bin/bash

################################################################################
# Bootstrap Script for Serverless Event-Driven Starter App
#
# This script automates the initial deployment of the application.
# It assumes AWS CLI is configured with valid credentials.
#
# Usage: ./bootstrap.sh <domain-name>
# Example: ./bootstrap.sh example.com
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRIMARY_REGION="eu-west-2"
CERT_REGION="us-east-1"
ENVIRONMENT="production"

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

################################################################################
# Validation Functions
################################################################################

check_domain_param() {
    if [ -z "$1" ]; then
        print_error "Domain name is required!"
        echo ""
        echo "Usage: $0 <domain-name>"
        echo "Example: $0 example.com"
        exit 1
    fi
}

check_required_tools() {
    print_step "Checking required tools..."
    
    local missing_tools=()
    
    for tool in aws node npm jq; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    # Check for CDK CLI
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK CLI not found. Install it with: npm install -g aws-cdk"
        exit 1
    fi
    
    print_success "All required tools are installed"
}

check_aws_credentials() {
    print_step "Checking AWS credentials..."
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or invalid"
        echo "Please run: aws configure"
        exit 1
    fi
    
    print_success "AWS credentials are valid"
}

check_route53_zone() {
    local domain=$1
    print_step "Checking if Route53 hosted zone exists for $domain..."
    
    if ! aws route53 list-hosted-zones-by-name --dns-name "$domain" --query "HostedZones[?Name=='${domain}.'].Id" --output text 2>/dev/null | grep -q "hostedzone"; then
        print_error "No Route53 hosted zone found for $domain"
        echo "Please create a hosted zone for $domain in Route53 first"
        exit 1
    fi
    
    print_success "Route53 hosted zone exists"
}

################################################################################
# AWS Discovery Functions
################################################################################

get_aws_account_id() {
    aws sts get-caller-identity --query Account --output text
}

get_aws_region() {
    aws configure get region || echo "$PRIMARY_REGION"
}

################################################################################
# Configuration Functions
################################################################################

update_cdk_config() {
    local domain=$1
    local api_domain="api.$domain"
    local frontend_url="https://$domain"
    
    print_step "Updating CDK configuration with domain: $domain"
    
    # Backup original cdk.json
    cp cdk/cdk.json cdk/cdk.json.backup
    
    # Update domain names and CORS origin in cdk.json
    cd cdk
    local temp_file=$(mktemp)
    jq --arg domain "$domain" --arg apiDomain "$api_domain" --arg frontendUrl "$frontend_url" \
        '.context.domainName = $domain | .context.apiDomainName = $apiDomain | .context.allowedOrigin = $frontendUrl' \
        cdk.json > "$temp_file" && mv "$temp_file" cdk.json
    cd ..
    
    print_success "CDK configuration updated with CORS origin: $frontend_url"
}

################################################################################
# Deployment Functions
################################################################################

install_dependencies() {
    print_step "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

bootstrap_cdk() {
    local account_id=$1
    
    print_step "Bootstrapping CDK in $PRIMARY_REGION..."
    cdk bootstrap "aws://$account_id/$PRIMARY_REGION" --require-approval never
    print_success "CDK bootstrapped in $PRIMARY_REGION"
    
    print_step "Bootstrapping CDK in $CERT_REGION..."
    cdk bootstrap "aws://$account_id/$CERT_REGION" --require-approval never
    print_success "CDK bootstrapped in $CERT_REGION"
}

deploy_stacks() {
    print_step "Deploying CDK stacks (this may take 10-15 minutes)..."
    
    cd cdk
    
    print_info "Deploying DNS Stack (certificate validation may take 5-10 minutes)..."
    cdk deploy DNSStack --require-approval never
    print_success "DNS Stack deployed"
    
    print_info "Deploying Data Stack..."
    cdk deploy DataStack --require-approval never
    print_success "Data Stack deployed"
    
    print_info "Deploying Frontend Stack..."
    cdk deploy FrontendStack --require-approval never
    print_success "Frontend Stack deployed"
    
    print_info "Deploying Auth Stack..."
    cdk deploy AuthStack --require-approval never
    print_success "Auth Stack deployed"
    
    cd ..
}

build_and_deploy_frontend() {
    print_step "Building frontend..."
    
    cd frontend
    npm run build
    print_success "Frontend built"
    
    print_step "Deploying frontend to S3..."
    
    # Get S3 bucket name from CloudFormation
    local bucket_name=$(aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-frontend-stack" \
        --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
        --output text \
        --region "$PRIMARY_REGION")
    
    if [ -z "$bucket_name" ]; then
        print_error "Could not retrieve S3 bucket name"
        cd ..
        exit 1
    fi
    
    print_info "Syncing files to s3://$bucket_name/"
    aws s3 sync build/ "s3://$bucket_name/" --delete --region "$PRIMARY_REGION"
    print_success "Frontend deployed to S3"
    
    print_step "Invalidating CloudFront cache..."
    
    # Get CloudFront distribution ID
    local distribution_id=$(aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-frontend-stack" \
        --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
        --output text \
        --region "$PRIMARY_REGION")
    
    if [ -z "$distribution_id" ]; then
        print_error "Could not retrieve CloudFront distribution ID"
        cd ..
        exit 1
    fi
    
    aws cloudfront create-invalidation \
        --distribution-id "$distribution_id" \
        --paths "/*" \
        --region "$PRIMARY_REGION" > /dev/null
    
    print_success "CloudFront cache invalidated"
    
    cd ..
}

################################################################################
# Summary Functions
################################################################################

show_summary() {
    local domain=$1
    local api_domain="api.$domain"
    
    print_header "Deployment Summary"
    
    echo -e "${GREEN}✓ Infrastructure deployed successfully!${NC}"
    echo ""
    echo "Your application is now available at:"
    echo ""
    echo -e "  ${BLUE}Frontend:${NC} https://$domain"
    echo -e "  ${BLUE}API:${NC}      https://$api_domain"
    echo ""
    echo "Resources created:"
    echo ""
    
    # Get stack outputs
    echo -e "${YELLOW}DNS Stack:${NC}"
    aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-dns-stack" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table \
        --region "$CERT_REGION"
    
    echo ""
    echo -e "${YELLOW}Data Stack:${NC}"
    aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-data-stack" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table \
        --region "$PRIMARY_REGION"
    
    echo ""
    echo -e "${YELLOW}Auth Stack:${NC}"
    aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-auth-stack" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table \
        --region "$PRIMARY_REGION"
    
    echo ""
    echo -e "${YELLOW}Frontend Stack:${NC}"
    aws cloudformation describe-stacks \
        --stack-name "$ENVIRONMENT-frontend-stack" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table \
        --region "$PRIMARY_REGION"
    
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo "1. Visit https://$domain to see your application"
    echo "2. Try signing up for an account"
    echo "3. Test the login flow"
    echo "4. View your dashboard"
    echo ""
    echo -e "${YELLOW}Note:${NC} CloudFront may take 15-30 minutes to fully propagate globally."
    echo ""
    echo -e "${GREEN}Happy building! 🚀${NC}"
    echo ""
}

################################################################################
# Main Script
################################################################################

main() {
    local domain=$1
    
    print_header "Serverless Event-Driven Starter App Bootstrap"
    
    echo "This script will:"
    echo "  • Validate prerequisites"
    echo "  • Configure the application for domain: $domain"
    echo "  • Install dependencies"
    echo "  • Bootstrap AWS CDK"
    echo "  • Deploy all infrastructure stacks"
    echo "  • Build and deploy the frontend"
    echo ""
    print_info "Estimated time: 15-20 minutes"
    echo ""
    
    # Validation
    check_domain_param "$domain"
    check_required_tools
    check_aws_credentials
    check_route53_zone "$domain"
    
    # Get AWS info
    local account_id=$(get_aws_account_id)
    print_success "AWS Account ID: $account_id"
    
    # Configuration
    update_cdk_config "$domain"
    
    # Deployment
    install_dependencies
    bootstrap_cdk "$account_id"
    deploy_stacks
    build_and_deploy_frontend
    
    # Summary
    show_summary "$domain"
}

# Run main function
main "$@"
