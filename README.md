# Manvi's Kitchen - Serverless Food Ordering Platform

A complete serverless food ordering system for weekend meal delivery, built with AWS CDK, DynamoDB, Lambda, and Angular.

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         CloudFront CDN                          │
│  ┌──────────────────────┐      ┌──────────────────────────┐   │
│  │  Frontend (Angular)  │      │   Images (S3 + CF)       │   │
│  └──────────────────────┘      └──────────────────────────┘   │
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
│  │ Order Lambda │  │ Item Lambda  │  │ Slot Mgmt    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              |
                              v
┌─────────────────────────────────────────────────────────────────┐
│                      DynamoDB Tables                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Orders       │  │ Items        │  │ Slot Avail.  │         │
│  │ Inventory    │  │              │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              |
                              v
┌─────────────────────────────────────────────────────────────────┐
│                    EventBridge Scheduler                        │
│              (Weekly Slot Opening - Monday 00:00)               │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Order Management
- **6-Character Order IDs**: Random alphanumeric (e.g., `A3K9M2`) - phone-friendly
- **Delivery Slots**: Saturday/Sunday Lunch/Dinner
- **Same-Day Prevention**: Cannot order for same day
- **15-Minute Hold**: Orders auto-cancelled if not confirmed
- **Status Tracking**: Created → Accepted → Cooking → Ready → Delivered

### 2. Inventory System (Loosely Coupled)
- **Slot Availability Table**: Independent inventory per item per slot
- **Automatic Slot Opening**: EventBridge triggers every Monday at 00:00 UTC
- **Default Quantity**: 10 units per slot (configurable via API)
- **Real-Time Updates**: Atomic quantity reduction on order placement
- **TTL Auto-Reversal**: DynamoDB Streams restore quantity after 15 minutes

### 3. Authentication & Authorization
- **Cognito User Pool**: Admin-only access
- **MFA Support**: Optional SMS/TOTP
- **API Gateway Authorizer**: All endpoints protected

### 4. Image Management
- **S3 Storage**: Item images with presigned upload URLs
- **CloudFront CDN**: Global image delivery
- **CORS Enabled**: Direct browser uploads

## Database Schema

### OrderTable
```
PK: orderId (6-char: A3K9M2)
GSI: orderStatus-slotDate-index (PK: orderStatus, SK: slotDate)
Attributes: orderedBy, customerName, deliveryAddress, contactNumber, 
            orderStatus (Created|Accepted|Cooking|Ready|Delivered),
            orderScheduled, slot, slotDate, items[], total, 
            instructions, feedbackProvided, feedbackRequestCount, timestamp
```

### ItemTable
```
PK: itemId (UUID)
Attributes: name, description, price, category, imageUrl, available
```

### SlotAvailabilityTable
```
PK: slotKey (itemId#slot#date)
Attributes: availableQuantity, totalQuantity, itemName
```

### InventoryTable (Temporary Blocks)
```
PK: slotKey
SK: blockId (orderId#itemId)
TTL: 15 minutes
Attributes: quantity, status (BLOCKED only)
Stream: Enabled (for auto-reversal)
Note: Records deleted on confirmation (not kept as CONFIRMED)
```

## API Endpoints

### Orders
```
POST   /orders                    - Place order
GET    /orders                    - List orders (default: Created status)
GET    /orders/{orderId}          - Get order details
PUT    /orders/{orderId}          - Update order status
DELETE /orders/{orderId}          - Delete order
PUT    /orders/slot-availability  - Update slot quantities

Query Parameters for GET /orders:
- orderStatus: Created|Accepted|Cooking|Ready|Delivered (default: Created)
- fromDate: YYYY-MM-DD (filter slotDate >= fromDate)
- toDate: YYYY-MM-DD (filter slotDate <= toDate)
- orderedBy: user-sub (filter by customer)
- slot: saturday-lunch|saturday-dinner|sunday-lunch|sunday-dinner

Examples:
GET /orders                                    # Default: Created orders
GET /orders?orderStatus=Cooking                # All cooking orders
GET /orders?orderStatus=Accepted&fromDate=2024-01-20&toDate=2024-01-27
GET /orders?orderStatus=Ready&slot=saturday-lunch&orderedBy=user-123
```

### Items
```
POST   /items                - Create item
GET    /items                - List items with slot availability (includes isAvailable boolean)
GET    /items/{itemId}       - Get item details
PUT    /items/{itemId}       - Update item
DELETE /items/{itemId}       - Delete item
POST   /items/upload-url     - Generate presigned URL for image upload
```

**GET /items Response:**
```json
{
  "items": [
    {
      "itemId": "uuid",
      "name": "Biryani",
      "slotAvailability": {
        "saturday-lunch": {
          "quantity": 7,
          "isAvailable": true
        },
        "saturday-dinner": {
          "quantity": 0,
          "isAvailable": false
        }
      }
    }
  ]
}
```

## Order Flow

### 1. Place Order
```
Customer → API Gateway → Order Lambda
  ↓
Check slot availability (SlotAvailabilityTable)
  ↓
Reduce availableQuantity (atomic update)
  ↓
Create BLOCKED record in InventoryTable (TTL: 15 min)
  ↓
Generate 6-char order ID (e.g., A3K9M2)
  ↓
Create order in OrderTable (orderStatus: Created)
```

### 2. Confirm Order (within 15 min)
```
Admin → PUT /orders/{orderId} {orderStatus: "Accepted"}
  ↓
Delete inventory blocks (no CONFIRMED records kept)
  ↓
Quantity stays reduced in SlotAvailabilityTable
```

### 3. Auto-Cancel (after 15 min)
```
TTL expires → DynamoDB deletes BLOCKED record
  ↓
DynamoDB Stream → TTL Cleanup Lambda
  ↓
Restore availableQuantity in SlotAvailabilityTable
```

## Automation

### Weekly Slot Opening (EventBridge)
```
Schedule: Every Monday at 00:00 UTC
  ↓
Slot Management Lambda
  ↓
Scan all items from ItemTable
  ↓
For each item, create 4 slot records:
  - saturday-lunch (next Saturday)
  - saturday-dinner
  - sunday-lunch
  - sunday-dinner
  ↓
Set availableQuantity = 10 (default)
```

## Infrastructure (CDK)

### Constructs
```
lib/constructs/
├── api/
│   └── order-api.ts              - API Gateway + routes
├── auth/
│   └── cognito-auth.ts           - User pool + client
├── compute/
│   ├── order-lambdas.ts          - Order processing
│   ├── item-lambdas.ts           - Item management
│   ├── slot-management-lambda.ts - Weekly slot opening
│   └── ttl-cleanup-lambda.ts     - Auto-reversal on TTL
├── database/
│   ├── order-database.ts         - Orders table
│   ├── item-database.ts          - Items table
│   ├── inventory-database.ts     - Inventory blocks table
│   └── slot-availability-database.ts - Slot availability
├── frontend/
│   └── frontend-hosting.ts       - S3 + CloudFront
└── storage/
    └── image-storage.ts          - S3 + CloudFront for images
```

### Lambda Functions
```
lambda/
├── orders/              - Order CRUD + slot availability updates
├── items/               - Item CRUD + image upload URLs
├── slot-management/     - EventBridge triggered slot opening
└── ttl-cleanup/         - DynamoDB Stream triggered cleanup
```

## Deployment

### Prerequisites
```bash
npm install
cd lambda/orders && npm install && npm run build
cd ../items && npm install && npm run build
cd ../slot-management && npm install && npm run build
cd ../ttl-cleanup && npm install && npm run build
```

### Deploy Stack
```bash
npx cdk deploy ManviKitchenStack-{environment} --region us-east-2
```

### Environments
- `staging` - Development/testing
- `prod` - Production

## Key Design Decisions

### 1. Loosely Coupled Inventory
- **Why**: Items and inventory are separate concerns
- **Benefit**: Easy to adjust quantities without touching item catalog
- **Implementation**: SlotAvailabilityTable independent of ItemTable

### 2. 6-Character Order IDs
- **Why**: Phone-friendly, professional, no database needed
- **Format**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing 0,O,1,I)
- **Collision Risk**: 0.23% after 100K orders (negligible for weekend business)

### 3. TTL + DynamoDB Streams
- **Why**: Automatic cleanup without cron jobs
- **How**: TTL deletes expired blocks → Stream triggers Lambda → Restores quantity
- **Benefit**: Zero manual intervention, cost-effective
- **Note**: Only BLOCKED records trigger restoration (confirmed orders already deleted)

### 4. EventBridge Slot Opening
- **Why**: Predictable weekly schedule
- **Schedule**: Monday 00:00 UTC (opens slots for upcoming weekend)
- **Benefit**: Fully automated, no manual slot creation

### 5. Serverless Architecture
- **Why**: Pay-per-use, auto-scaling, zero maintenance
- **Cost**: ~$5-10/month for small business
- **Scalability**: Handles 1000s of orders without changes

## Monitoring & Logs

### CloudWatch Logs
- Lambda execution logs
- API Gateway access logs
- TTL cleanup operations
- Slot opening results

### CloudWatch Metrics
- Lambda invocations/errors
- DynamoDB read/write capacity
- API Gateway requests/latency
- TTL deletions

## Security

- **API**: Cognito authorizer on all endpoints
- **S3**: Private buckets with OAC (Origin Access Control)
- **DynamoDB**: IAM roles with least privilege
- **Secrets**: No hardcoded credentials
- **HTTPS**: Enforced via CloudFront

## Cost Optimization

- **DynamoDB**: On-demand billing (pay per request)
- **Lambda**: 1M free requests/month
- **S3**: Lifecycle policies for old images
- **CloudFront**: Price class ALL (includes India edge locations for local audience)
- **API Gateway**: REST API (cheaper than HTTP API for low volume)
- **Inventory Table**: Auto-cleanup on confirmation (no CONFIRMED records kept)

## Documentation

- `INVENTORY_SYSTEM.md` - Detailed inventory architecture
- `TTL_CLEANUP.md` - Auto-reversal mechanism
- `REFACTORING_SUMMARY.md` - Code cleanup history

## CI/CD

GitHub Actions workflows:
- `.github/workflows/deploy.yml` - CDK deployment
- `.github/workflows/deploy-frontend.yml` - Frontend deployment
- `.github/workflows/destroy.yml` - Stack cleanup

## Tech Stack

**Backend:**
- AWS CDK (TypeScript)
- Lambda (Node.js 22)
- DynamoDB
- API Gateway
- Cognito
- EventBridge
- S3 + CloudFront

**Frontend:**
- Angular
- TypeScript
- AWS Amplify (Cognito integration)

## License

Private project for Manvi's Kitchen
