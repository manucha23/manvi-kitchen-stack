# Manvi's Kitchen - Serverless Food Ordering Platform

A serverless kitchen order and inventory system built with AWS CDK, Lambda, DynamoDB, Angular, Cognito, S3, and CloudFront.

## Overview

This project manages customer orders using a limit-based availability model instead of a complex slot system. The current design is centered on:

- item-specific `lunch` and `dinner` order limits
- manual killswitch controls (global and per-item)
- lazy daily reset of order counts
- backend validation as the true gatekeeper
- frontend hosting via S3 + CloudFront

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         CloudFront CDN                          │
│  ┌──────────────┐      ┌──────────────────────────┐             │
│  │ Frontend App │      │   Images (S3 + CF)       │             │
│  └──────────────┘      └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              |
                              v
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (REST)                         │
│                    + Cognito Authorizer                         │
└─────────────────────────────────────────────────────────────────┘
                              |
                              v
┌─────────────────────────────────────────────────────────────────┐
│                      Lambda Functions                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Order Lambda │  │ Item Lambda  │  │ Admin Lambda │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              |
                              v
┌─────────────────────────────────────────────────────────────────┐
│                      DynamoDB Tables                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Orders       │  │ Items        │  │ Order Limits Config  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                           │
│                            ┌──────────────────────────┐      │
│                            │ Item Order Count Table   │      │
│                            └──────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### Order Management

- Place and manage orders through API Gateway
- Enforce item-level limits for lunch and dinner
- Reject orders when limits are reached
- Support manual global killswitch to pause all orders
- Support manual per-item killswitch to pause specific items
- Initialize with fresh data; no legacy slot migration required

### Availability Model

- `OrderLimitsConfigTable` stores limit settings and acceptance flags
- `ItemOrderCountTable` tracks daily counts for each item and slot
- Lazy reset logic resets counts on the first request for a new day
- Backend gatekeeper avoids issues from client-side bypass

### Frontend Hosting

- Angular app served from a private S3 bucket
- CloudFront distribution enforces HTTPS and delivers assets globally
- SPA routing returns `index.html` for 404/403 responses

### Image Uploads

- Image uploads are managed through presigned S3 URLs
- Images served through CloudFront for performance

## Current Data Model

### OrderTable

Primary items:
- `orderId`
- `status`
- `items`
- `slot`
- `slotDate`
- customer and metadata fields

### ItemTable

Primary items:
- `itemId`
- `name`
- `description`
- `price`
- `category`
- `imageUrl`
- `available`

### OrderLimitsConfigTable

Primary items:
- `itemId`
- `lunchLimit`
- `dinnerLimit`
- `isAcceptingOrders`
- `globalKillswitch` (for the `GLOBAL` config record)

### ItemOrderCountTable

Primary items:
- `countKey` (`itemId-slot-date`)
- `currentCount`
- `lastResetTimestamp`

## API Endpoints

### Orders

- `POST /orders` — place order
- `GET /orders` — list orders
- `GET /orders/{orderId}` — get order details
- `PUT /orders/{orderId}` — update order status
- `DELETE /orders/{orderId}` — delete order

### Items

- `POST /items` — create item
- `GET /items` — list items
- `GET /items/{itemId}` — get item details
- `PUT /items/{itemId}` — update item
- `DELETE /items/{itemId}` — delete item
- `POST /items/upload-url` — generate image upload URL

### Admin

- `GET /admin/order-limits` — list configured limits
- `PUT /admin/order-limits` — update order limit settings
- `PUT /admin/killswitch` — toggle global or per-item order acceptance

## Order Availability Logic

When a new order is placed, the backend:

1. checks the global killswitch
2. checks item-specific acceptance state
3. loads the configured lunch/dinner limit
4. atomically updates the item count in `ItemOrderCountTable`
5. rejects the order if the limit would be exceeded

This ensures concurrent orders cannot push the count above the allowed limit.

## Deployment

### Prerequisites

```bash
npm install
cd lambda/orders && npm install && npm run build
cd lambda/items && npm install && npm run build
cd lambda/admin && npm install && npm run build
```

### Deploy the CDK stack

For custom domain setup with CloudFront certificates (which must be in us-east-1):

```bash
# First, deploy the CloudFront certificate to us-east-1
npx cdk deploy CloudFrontCertificate-test --profile your-profile --region us-east-1

# Then deploy the main stack to your region (e.g., ap-south-1)
npx cdk synth
npx cdk deploy --context environment=test
```

For standard deployment without custom domain:

```bash
npx cdk synth
npx cdk deploy --context environment=staging
```

### Environments

- `staging` — Development / testing
- `prod` — Production

## Custom Domain and ACM

When a domain is purchased, integrate Route 53 and ACM by:

- importing or creating a Route 53 hosted zone
- creating ACM certificates for the domain
- attaching certificates to CloudFront and API Gateway
- creating Route 53 alias records for frontend and API

This hides the native API Gateway URL from customers and serves all traffic under your own domain.

## CDK Construct Summary

### Database Constructs

- `OrderDatabase`
- `ItemDatabase`
- `OrderHistoryDatabase`
- `OrderLimitsConfigDatabase`
- `ItemOrderCountDatabase`

### Compute Constructs

- `OrderLambdas`
- `ItemLambdas`
- `AdminLambdas`
- `OrderAuditLambda`

### Frontend

- `FrontendHosting` — S3 + CloudFront distribution

### API

- `OrderApi` — REST API routes for orders, items, and admin actions

## Security

- Cognito authorizer protects API routes
- S3 buckets are private and use Origin Access Control
- HTTPS enforced through CloudFront
- IAM roles follow least privilege

## Notes

- The current design is intentionally simpler than the previous slot-based system
- The backend is the authoritative gatekeeper for all order acceptance
- No slot scheduler or eventbridge slot creation is required in the current architecture
- The system is built for fresh startup usage without legacy data migration

## License

Private project for Manvi's Kitchen

#?          - frontend hosting via S??
#?  ??#?          - frontend hosting via S??
#?  ?──???────────??  ?──────────?a
### System???##??#??
### Sre #?  ??#?          - frontend hostige#?  ?──???────────??  Cu### System???##??#??
### System???##??#???``
┌────??vel### Sys- ### System???##??#?cu┌────??vel### S
#     ? back?? manual killswitch cont?? back?? man? back?? manual killswitc m     ? back?? manual killswitch cont?? back?? man? back?? manu `item     ? back?? mars     ? back?? manual killsw       ? back?? manual killswitch cont?? back?? man? back?? manual ng
#?          - frontend hosting via S??
#?  ??#?          - frontend hosting via S??
#?  ?──???────────??   — place order#?          - frontend hosting via S??
#?  ??#?          - frontend hosting via S??
#?  ?──???──────── `#?  ??#?          - frontend hostide#?  ?──???────────item
- `G### System???##??#??
### Sre #?  ??#?          -t item details
- `PUT /items### Sre #?  ??#? it### System???##??#???``
┌────??vel### Sys- ### System???##??#?cu┌────??vel### S
#     ? /┌────??vel### St #     ? back?? manual killswitch cont?? back?? man? back?? manual killPU#?          - frontend hosting via S??
#?  ??#?          - frontend hosting via S??
#?  ?──???────────??   — place order#?          - frontend hosting via S??
#?  ??#?          - frontend hosting via S??
#?  ?──???──────── `unt in `Item#?  ??#?          - frontend hostif #?  ?──???────────??  re#?  ??#?          - frontend hosting via S??
#?  ?──???──────── `#?  ??# i#?  ?──???──────── `#? n - `G### System???##??#??
### Sre #?  ??#?          -t item details
- `PUT /items### Sre #?  ??

### Deploy the CDK stac### Sre #?  ??#?     px- `PUT /items### Sre #?  ??#? it### Sys`

┌────??vel### Sys- ### System???##??#?cu┌── ?     ? /┌────??vel### St #     ? back?? manual killswitch contut#?  ??#?          - frontend hosting via S??
#?  ?──???────────??   — place order#?          - frontend hdFront and API Gateway
-#?  ?──???────────??  d #?  ??#?          - frontend hosting via S??
#?  ?──???──────── `unt in `It

#?  ?──???──────── `unt is
#?  ?──???──────── `#?  ??# i#?  ?──???──────── `#? n - `G### System???##??#??
### Sre #?  ??#?          -t item details
- inLambdas`
- `### Sre #?  ??#?          -t item details
- `PUT /items### Sre #?  ??

### Deploy the CDK stac### Sre #?  ??#?     px-r - `PUT /items### Sre #?  ??

### Deploy th


### Deploy the CDK stac### S AP
┌────??vel### Sys- ### System???##??#?cu┌── ?     ? /┌────??on#?  ?──???────────??   — place order#?          - frontend hdFront and API Gateway
-#?  ?──???────────??  d #?  ??#?          - frontendnc-#?  ?──???────────??  d #?  ??#?          - frontend hosting via S??
#?  ?─t #?  ?──???──────── `unt in `It

#?  ?──???──────── `uhen
