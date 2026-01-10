import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

interface AuthStackProps extends cdk.StackProps {
  environment: string;
  table: dynamodb.Table;
  apiDomainName: string;
  hostedZone: route53.IHostedZone;
  allowedOrigin: string;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { environment, table, apiDomainName, hostedZone, allowedOrigin } = props;

    // Create API certificate in the same region as API Gateway (required)
    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: apiDomainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create JWT secret in Secrets Manager
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `${environment}-auth-jwt-secret`,
      description: 'JWT secret for authentication',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        passwordLength: 32,
        excludeCharacters: '"@/\\',
      },
    });

    // Common Lambda configuration
    const lambdaEnvironment = {
      TABLE_NAME: table.tableName,
      SECRET_ARN: jwtSecret.secretArn,
      ENVIRONMENT: environment,
      ALLOWED_ORIGIN: allowedOrigin,
    };

    const lambdaProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
    };

    // Signup Lambda
    const signupFunction = new NodejsFunction(this, 'SignupFunction', {
      ...lambdaProps,
      functionName: `${environment}-auth-signup`,
      entry: '../services/auth/src/handlers/signup.ts',
      handler: 'handler',
      description: 'User signup handler',
    });

    // Login Lambda
    const loginFunction = new NodejsFunction(this, 'LoginFunction', {
      ...lambdaProps,
      functionName: `${environment}-auth-login`,
      entry: '../services/auth/src/handlers/login.ts',
      handler: 'handler',
      description: 'User login handler',
    });

    // Get User Lambda
    const getUserFunction = new NodejsFunction(this, 'GetUserFunction', {
      ...lambdaProps,
      functionName: `${environment}-auth-get-user`,
      entry: '../services/auth/src/handlers/get-user.ts',
      handler: 'handler',
      description: 'Get user data handler',
    });

    // Grant permissions
    table.grantReadWriteData(signupFunction);
    table.grantReadData(loginFunction);
    table.grantReadData(getUserFunction);
    jwtSecret.grantRead(loginFunction);
    jwtSecret.grantRead(getUserFunction);

    // Create HTTP API
    const httpApi = new apigatewayv2.HttpApi(this, 'AuthApi', {
      apiName: `${environment}-auth-api`,
      description: 'Authentication API',
      corsPreflight: {
        allowOrigins: [allowedOrigin],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Create custom domain for API
    const domainName = new apigatewayv2.DomainName(this, 'ApiDomainName', {
      domainName: apiDomainName,
      certificate: apiCertificate,
    });

    // Map custom domain to API
    new apigatewayv2.ApiMapping(this, 'ApiMapping', {
      api: httpApi,
      domainName: domainName,
      stage: httpApi.defaultStage,
    });

    // Create Route53 record for API
    new route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: apiDomainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId
        )
      ),
    });

    // Add routes
    httpApi.addRoutes({
      path: '/auth/signup',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'SignupIntegration',
        signupFunction
      ),
    });

    httpApi.addRoutes({
      path: '/auth/login',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'LoginIntegration',
        loginFunction
      ),
    });

    httpApi.addRoutes({
      path: '/auth/user',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'GetUserIntegration',
        getUserFunction
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url!,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ApiDomainUrl', {
      value: `https://${apiDomainName}`,
      description: 'API Custom Domain URL',
    });

    new cdk.CfnOutput(this, 'JwtSecretArn', {
      value: jwtSecret.secretArn,
      description: 'JWT Secret ARN',
    });
  }
}
