# Orders Lambda

Complete order management system for Manvi's Kitchen food ordering platform with integrated inventory blocking.

## Overview

The Orders Lambda handles all order-related operations including creation, retrieval, updates, and deletion. It integrates with Cognito for authentication, validates items and schedules, manages inventory blocking with TTL-based auto-reversal, and tracks order lifecycle from creation to delivery.

## Features

### 1. Order Creation
- **Auto-generated Order IDs**: 6-character alphanumeric (e.g., A3K9M2)
- **User Authentication**: Extracts user from Cognito JWT token
- **Schedule Validation**: Ensures orders are for future dates with available slots
- **Item Validation**: Verifies items exist and are available
- **Inventory Blocking**: Atomically reduces slot availability and creates BLOCKED records with 15-min TTL
- **Price Calculation**: Automatically calculates item amounts and order total
- **Default Values**: Sets initial status, feedback flags, and timestamps

### 2. Order Retrieval
- **Get Single Order**: Fetch order by ID
- **List All Orders**: Retrieve all orders
- **Filter by Status**: List orders by status (Created, Accepted, Cooking, Ready, Delivered)
- **Filter by User**: List orders by specific user

### 3. Order Updates
- **Status Management**: Update order through lifecycle stages
- **Inventory Confirmation**: Deletes BLOCKED records when status = Accepted
- **Inventory Release**: Restores quantities when status = Cancelled
- **Feedback Tracking**: Mark feedback as provided
- **Feedback Requests**: Increment request counter
- **Instructions**: Update delivery instructions
- **Timestamp Tracking**: Auto-updates timestamp on changes

### 4. Order Deletion
- **Soft/Hard Delete**: Remove orders from system

### 5. Order History
- **Audit Trail**: Track all changes to orders over time

### 6. Slot Availability Management
- **Update Quantities**: Adjust available slots for items

### 7. Inventory Blocking System
- **Atomic Quantity Reduction**: Prevents overselling with conditional updates
- **Temporary Blocks**: Creates BLOCKED records with 15-minute TTL
- **Auto-Reversal**: TTL Cleanup Lambda restores quantities on expiry
- **Confirmation**: Deletes blocks when order accepted (keeps quantity reduced)
- **Cancellation**: Restores quantities and deletes blocks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                             │
│              (Cognito Authorizer)                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orders Lambda                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  index.ts (Router)                                   │  │
│  └────────┬─────────────────────────────────────────────┘  │
│           │                                                 │
│  ┌────────▼──────────────────────────────────────────────┐ │
│  │  Handlers                                             │ │
│  │  • create-order.handler.ts                            │ │
│  │  • get-order.handler.ts                               │ │
│  │  • list-orders.handler.ts                             │ │
│  │  • update-order.handler.ts                            │ │
│  │  • delete-order.handler.ts                            │ │
│  │  • update-slot-availability.handler.ts                │ │
│  │  • get-order-history.handler.ts                       │ │
│  └───────────────────────────────────────────────────────┘ │
│           │                                                 │
│  ┌────────▼──────────────────────────────────────────────┐ │
│  │  Services                                             │ │
│  │  • inventory.service.ts                               │ │
│  └───────────────────────────────────────────────────────┘ │
│           │                                                 │
│  ┌────────▼──────────────────────────────────────────────┐ │
│  │  Models                                               │ │
│  │  • order.model.ts (Order, OrderItem, OrderStatus)     │ │
│  │  • order.dto.ts (Request/Response DTOs)               │ │
│  └───────────────────────────────────────────────────────┘ │
│           │                                                 │
│  ┌────────▼──────────────────────────────────────────────┐ │
│  │  Utils                                                │ │
│  │  • response.util.ts (API responses)                   │ │
│  │  • order-counter.util.ts (ID generation)              │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  DynamoDB Tables                            │
│  • OrderTable                                               │
│  • ItemTable                                                │
│  • SlotAvailabilityTable                                    │
│  • OrderHistoryTable                                        │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Create Order
```http
POST /orders
Authorization: Bearer <cognito-jwt-token>

Request:
{
  "customerName": "John Doe",
  "deliveryAddress": "123 Main St, City",
  "contactNumber": "+1234567890",
  "orderScheduled": "2024-01-20T18:00:00Z",
  "slot": "saturday-lunch",
  "items": [
    { "id": "item-uuid-1", "quantity": 2 },
    { "id": "item-uuid-2", "quantity": 1 }
  ],
  "instructions": "Ring doorbell twice"
}

Response: 201 Created
{
  "orderId": "A3K9M2",
  "orderedBy": "user-sub-from-cognito",
  "customerName": "John Doe",
  "deliveryAddress": "123 Main St, City",
  "contactNumber": "+1234567890",
  "orderStatus": "Created",
  "orderScheduled": "2024-01-20T18:00:00Z",
  "slot": "saturday-lunch",
  "slotDate": "2024-01-20",
  "timestamp": "2024-01-15T10:30:00Z",
  "items": [
    {
      "id": "item-uuid-1",
      "name": "Biryani",
      "price": 250,
      "quantity": 2,
      "amount": 500
    }
  ],
  "total": 550,
  "instructions": "Ring doorbell twice",
  "feedbackProvided": false,
  "feedbackRequestCount": 0
}
```

### Get Order
```http
GET /orders/{orderId}
Authorization: Bearer <token>

Response: 200 OK
{
  "orderId": "A3K9M2",
  ...
}
```

### List Orders
```http
# Default: Returns Created orders (pending orders)
GET /orders
Authorization: Bearer <token>

# Filter by status
GET /orders?orderStatus=Cooking

# Filter by status with date range
GET /orders?orderStatus=Accepted&fromDate=2024-01-20&toDate=2024-01-27

# Filter by date range only (uses Created status)
GET /orders?fromDate=2024-01-20&toDate=2024-01-27

# Filter by user (applied as filter on status query)
GET /orders?orderStatus=Delivered&orderedBy=user-sub-123

# Filter by slot (applied as filter on status query)
GET /orders?orderStatus=Ready&slot=saturday-lunch

# Combined filters
GET /orders?orderStatus=Accepted&fromDate=2024-01-20&toDate=2024-01-27&slot=saturday-lunch&orderedBy=user-sub-123

Response: 200 OK
{
  "items": [...],
  "count": 5
}

Query Parameters:
- orderStatus: Created|Accepted|Cooking|Ready|Delivered (default: Created)
- fromDate: YYYY-MM-DD (filter slotDate >= fromDate)
- toDate: YYYY-MM-DD (filter slotDate <= toDate)
- orderedBy: user-sub (filter by customer)
- slot: saturday-lunch|saturday-dinner|sunday-lunch|sunday-dinner
```

### Update Order
```http
PUT /orders/{orderId}
Authorization: Bearer <token>

Request:
{
  "orderStatus": "Accepted",
  "instructions": "Updated instructions",
  "feedbackProvided": true,
  "incrementFeedbackRequest": true
}

Response: 200 OK
{
  "orderId": "A3K9M2",
  "orderStatus": "Accepted",
  ...
}
```

### Delete Order
```http
DELETE /orders/{orderId}
Authorization: Bearer <token>

Response: 204 No Content
```

### Get Order History
```http
GET /orders/{orderId}/history
Authorization: Bearer <token>

Response: 200 OK
{
  "orderId": "A3K9M2",
  "history": [...]
}
```

### Update Slot Availability
```http
PUT /orders/slot-availability
Authorization: Bearer <token>

Request:
{
  "itemId": "item-uuid",
  "slot": "saturday-lunch",
  "date": "2024-01-20",
  "quantity": 15
}

Response: 200 OK
{
  "message": "Slot availability updated",
  "itemId": "item-uuid",
  "slot": "saturday-lunch",
  "date": "2024-01-20",
  "quantity": 15
}
```

## Order Lifecycle

```
Created → Accepted → Cooking → Ready → Delivered
```

### Status Definitions

| Status | Description |
|--------|-------------|
| **Created** | Order placed by customer, awaiting admin acceptance |
| **Accepted** | Admin accepted the order, will prepare |
| **Cooking** | Order is being prepared |
| **Ready** | Order ready for pickup/delivery |
| **Delivered** | Order delivered to customer |

## Validation Rules

### Create Order
1. **Authentication**: User must be authenticated via Cognito
2. **Required Fields**: customerName, deliveryAddress, contactNumber, orderScheduled, slot, items
3. **Slot Validation**: Must be one of: saturday-lunch, saturday-dinner, sunday-lunch, sunday-dinner
4. **Schedule Validation**:
   - Must be in the future
   - Must exist in SlotAvailabilityTable (created by slot-management lambda)
5. **Item Validation**:
   - Each item must exist in ItemTable
   - Each item must be available (available = true)
   - Quantity must be > 0
6. **Availability Check**:
   - Checks SlotAvailabilityTable for sufficient quantity
   - Prevents overselling with atomic updates
7. **Calculations**:
   - Item amount = price × quantity
   - Order total = sum of all item amounts
8. **Inventory Blocking**:
   - Atomically reduces availableQuantity in SlotAvailabilityTable
   - Creates BLOCKED record in InventoryTable with 15-min TTL

### Update Order
1. **Order Exists**: Order must exist in database
2. **Valid Status**: Must be one of: Created, Accepted, Cooking, Ready, Delivered
3. **At Least One Field**: Must update at least one field
4. **Inventory Management**:
   - Status = Accepted: Calls confirmInventory() to delete BLOCKED records
   - Status = Cancelled: Calls releaseInventory() to restore quantities

## Data Models

### Order
```typescript
{
  orderId: string;              // Auto-generated (6-char)
  orderedBy: string;            // From Cognito JWT
  customerName: string;
  deliveryAddress: string;
  contactNumber: string;
  orderStatus: OrderStatus;     // Default: Created
  orderScheduled: string;       // ISO datetime
  slot: string;                 // saturday-lunch, saturday-dinner, sunday-lunch, sunday-dinner
  slotDate: string;             // YYYY-MM-DD (extracted from orderScheduled)
  timestamp: string;            // Auto-generated
  items: OrderItem[];
  total: number;                // Calculated
  instructions?: string;
  feedbackProvided: boolean;    // Default: false
  feedbackRequestCount: number; // Default: 0
}
```

### OrderItem
```typescript
{
  id: string;
  name: string;        // From ItemTable
  price: number;       // From ItemTable
  quantity: number;
  amount: number;      // Calculated: price × quantity
}
```

### OrderStatus Enum
```typescript
enum OrderStatus {
  CREATED = 'Created',
  ACCEPTED = 'Accepted',
  COOKING = 'Cooking',
  READY = 'Ready',
  DELIVERED = 'Delivered'
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ORDER_TABLE` | DynamoDB table for orders |
| `ITEM_TABLE` | DynamoDB table for menu items |
| `SLOT_AVAILABILITY_TABLE` | DynamoDB table for slot availability |
| `ORDER_HISTORY_TABLE` | DynamoDB table for order audit trail |
| `INVENTORY_TABLE` | DynamoDB table for inventory blocks (TTL enabled) |

## Dependencies

```json
{
  "@aws-sdk/client-dynamodb": "^3.0.0",
  "@aws-sdk/lib-dynamodb": "^3.0.0",
  "uuid": "^9.0.0"
}
```

## Build & Deploy

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy (via CDK)
cd ../..
npx cdk deploy ManviKitchenStack-staging
```

## Error Handling

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (Delete) |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (missing/invalid auth) |
| 404 | Not Found (order doesn't exist) |
| 405 | Method Not Allowed |
| 500 | Internal Server Error |

## Integration Points

### Cognito
- Extracts `orderedBy` from JWT token claims (sub or username)
- Validates user authentication

### ItemTable
- Validates items exist
- Fetches item details (name, price, availability)

### SlotAvailabilityTable
- Validates scheduled date has available slots
- Managed by slot-management lambda

### OrderHistoryTable
- Tracks order changes over time
- Managed by order-audit lambda

### InventoryTable
- Tracks temporary inventory blocks with 15-min TTL
- DynamoDB Streams enabled (triggers TTL Cleanup Lambda)
- Only stores BLOCKED records (confirmed orders delete the record)
- Auto-reversal on TTL expiry restores quantities

## Inventory Blocking Flow

```
1. Customer places order
   ↓
2. Check availability (checkAvailability)
   ↓
3. Block inventory (blockInventory)
   • Atomically reduce availableQuantity
   • Create BLOCKED record with TTL (15 min)
   ↓
4. Create order (status: Created)
   ↓
   ┌─────────────────┬─────────────────┐
   │                 │                 │
5a. Admin accepts   5b. TTL expires   5c. Admin cancels
   (within 15 min)     (after 15 min)     (anytime)
   ↓                   ↓                   ↓
   confirmInventory()  TTL Cleanup Lambda  releaseInventory()
   • Delete BLOCKED    • Restore quantity  • Restore quantity
   • Keep qty reduced  • Auto-reversal     • Delete BLOCKED
```

## Testing

```bash
# Create order
curl -X POST https://api.example.com/orders \
  -H "Authorization: Bearer <token>" \
  -d '{
    "customerName": "John Doe",
    "deliveryAddress": "123 Main St",
    "contactNumber": "+1234567890",
    "orderScheduled": "2024-01-20T18:00:00Z",
    "slot": "saturday-lunch",
    "items": [{"id": "item-1", "quantity": 2}]
  }'

# Get order
curl https://api.example.com/orders/A3K9M2 \
  -H "Authorization: Bearer <token>"

# Update order status
curl -X PUT https://api.example.com/orders/A3K9M2 \
  -H "Authorization: Bearer <token>" \
  -d '{"orderStatus": "Accepted"}'

# List orders
curl https://api.example.com/orders?orderStatus=Cooking \
  -H "Authorization: Bearer <token>"
```

## Monitoring

### CloudWatch Logs
- Lambda execution logs
- Error traces
- Validation failures

### CloudWatch Metrics
- Invocation count
- Error rate
- Duration
- Throttles

## Security

- **Authentication**: Cognito JWT required for all endpoints
- **Authorization**: User context extracted from token
- **Input Validation**: All inputs validated before processing
- **Error Handling**: Sensitive data not exposed in errors

## Future Enhancements

- [ ] Payment integration
- [ ] Order notifications (SMS/Email)
- [ ] Real-time order tracking
- [ ] Order cancellation by customer
- [ ] Bulk order operations
- [ ] Order analytics and reporting
