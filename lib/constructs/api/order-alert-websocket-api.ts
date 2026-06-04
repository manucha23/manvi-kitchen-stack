import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface OrderAlertWebSocketApiProps {
  environment: string;
  handler: lambda.IFunction;
  hostedZone: route53.IHostedZone;
  certificate?: acm.ICertificate;
  domainName: string;
}

export class OrderAlertWebSocketApi extends Construct {
  public readonly api: apigwv2.WebSocketApi;
  public readonly stage: apigwv2.WebSocketStage;
  public readonly customDomain: apigwv2.DomainName;
  public readonly rawWebSocketUrl: string;
  public readonly customWebSocketUrl: string;
  public readonly managementEndpoint: string;

  constructor(scope: Construct, id: string, props: OrderAlertWebSocketApiProps) {
    super(scope, id);

    const integration = new apigwv2Integrations.WebSocketLambdaIntegration(
      'OrderAlertIntegration',
      props.handler,
    );

    this.api = new apigwv2.WebSocketApi(this, 'Api', {
      apiName: `Order Alerts - ${props.environment}`,
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: { integration },
      disconnectRouteOptions: { integration },
      defaultRouteOptions: { integration },
    });

    this.stage = new apigwv2.WebSocketStage(this, 'Stage', {
      webSocketApi: this.api,
      stageName: props.environment,
      autoDeploy: true,
    });

    const certificate = props.certificate ?? new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    this.customDomain = new apigwv2.DomainName(this, 'DomainName', {
      domainName: props.domainName,
      certificate,
    });

    new apigwv2.ApiMapping(this, 'ApiMapping', {
      api: this.api,
      domainName: this.customDomain,
      stage: this.stage,
    });

    new route53.ARecord(this, 'DnsRecord', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
        this.customDomain.regionalDomainName,
        this.customDomain.regionalHostedZoneId,
      )),
    });

    this.rawWebSocketUrl = `${this.api.apiEndpoint}/${props.environment}`;
    this.customWebSocketUrl = `wss://${props.domainName}`;
    this.managementEndpoint = `${this.api.apiEndpoint.replace('wss://', 'https://')}/${props.environment}`;

    new cdk.CfnOutput(this, 'RawWebSocketUrl', {
      value: this.rawWebSocketUrl,
      description: 'Raw API Gateway WebSocket URL',
    });

    new cdk.CfnOutput(this, 'CustomWebSocketUrl', {
      value: this.customWebSocketUrl,
      description: 'Custom WebSocket URL',
    });
  }
}
