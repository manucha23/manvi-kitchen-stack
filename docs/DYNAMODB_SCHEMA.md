# DynamoDB Tables Schema Documentation

This document describes all DynamoDB tables used in the Manvi Kitchen Stack, including their primary keys, indexes, and attributes.

---

## 1. OrderTable

**Purpose**: Stores customer orders with their items, status, and delivery information.

### Primary Key
- **Partition Key**: `orderId` (String) - Unique identifier for each order

### Global Secondary Indexes

#### customerPhone-createdAt-index
- **Partition Key**: `customerPhone` (String) - Customer contact number
- **Sort Key**: `createdAt` (String) - ISO timestamp of order creation
- **Use Case**: Query customer order history sorted by recency

#### status-createdAt-index
- **Partition Key**: `status` (String) - Order status (CREATED, CONFIRMED, COMPLETED, CANCELLED)
- **Sort Key**: `createdAt` (String) - ISO timestamp of order creation
- **Use Case**: Query orders by status sorted by creation time (most recent first)

#### slotDate-slot-index
- **Partition Key**: `slotDate` (String) - Date of the order slot (YYYY-MM-DD format)
- **Sort Key**: `slot` (String) - Time slot (lunch/dinner)
- **Use Case**: Query all orders for a specific date grouped by slot type

### Attributes
- `orderId` (String) - Unique order identifier
- `status` (String) - Order status enum
- `items` (List) - Array of ordered items with quantities
- `slot` (String) - Time slot (lunch/dinner)
- `slotDate` (String) - Delivery date
- `orderedBy` (String) - Customer identifier
- `customerName` (String) - Customer name
- `customerPhone` (String) - Contact number
- `deliveryAddress` (String) - Delivery location
- `totalAmount` (Number) - Order total price
- `createdAt` (String) - Order creation timestamp
- `updatedAt` (String) - Last update timestamp

### Special Features
- **DynamoDB Streams**: Enabled with NEW_AND_OLD_IMAGES for audit logging
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **Removal Policy**: DESTROY (for development)

---

## 2. ItemTable

**Purpose**: Stores menu items with pricing, descriptions, and availability status.

### Primary Key
- **Partition Key**: `itemId` (String) - Unique identifier for each menu item

### Indexes
None

### Attributes
- `itemId` (String) - Unique item identifier
- `name` (String) - Item name
- `description` (String) - Item description
- `price` (Number) - Item price
- `category` (String) - Item category (e.g., main course, dessert)
- `imageUrl` (String) - CloudFront URL for item image
- `available` (Boolean) - Item availability flag
- `createdAt` (String) - Item creation timestamp
- `updatedAt` (String) - Last update timestamp

### Special Features
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **Removal Policy**: DESTROY (for development)

---

## 3. OrderHistoryTable

**Purpose**: Maintains audit trail of all order status changes and modifications.

### Primary Key
- **Partition Key**: `orderId` (String) - Order identifier
- **Sort Key**: `timestamp` (String) - ISO timestamp of the change

### Indexes
None

### Attributes
- `orderId` (String) - Related order identifier
- `timestamp` (String) - When the change occurred
- `oldStatus` (String) - Previous order status
- `newStatus` (String) - New order status
- `changedBy` (String) - User who made the change
- `changeType` (String) - Type of change (STATUS_CHANGE, UPDATE, DELETE)
- `oldImage` (Map) - Complete order data before change
- `newImage` (Map) - Complete order data after change

### Special Features
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **Removal Policy**: DESTROY (for development)
- **Data Source**: Populated automatically via DynamoDB Streams from OrderTable

---

## 4. OrderLimitsConfigTable

**Purpose**: Stores order acceptance limits and killswitch configurations for each menu item.

### Primary Key
- **Partition Key**: `itemId` (String) - Item identifier or "GLOBAL" for system-wide config

### Global Secondary Indexes

#### killswitch-index
- **Partition Key**: `configType` (String) - Configuration type identifier
- **Use Case**: Query global killswitch settings efficiently

### Attributes
- `itemId` (String) - Item identifier or "GLOBAL"
- `lunchLimit` (Number) - Maximum orders allowed for lunch slot
- `dinnerLimit` (Number) - Maximum orders allowed for dinner slot
- `isAcceptingOrders` (Boolean) - Item-specific killswitch flag
- `globalKillswitch` (Boolean) - System-wide order acceptance flag (only on GLOBAL record)
- `configType` (String) - Type identifier for GSI queries
- `updatedAt` (String) - Last configuration update timestamp

### Special Features
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **Removal Policy**: DESTROY (for development)
- **Special Record**: `itemId="GLOBAL"` contains system-wide killswitch

---

## 5. ItemOrderCountTable

**Purpose**: Tracks daily order counts per item and slot for limit enforcement.

### Primary Key
- **Partition Key**: `countKey` (String) - Composite key format: `{itemId}-{slot}-{YYYY-MM-DD}`

### Global Secondary Indexes

#### itemId-date-index
- **Partition Key**: `itemId` (String) - Item identifier
- **Sort Key**: `date` (String) - Date in YYYY-MM-DD format
- **Use Case**: Query all slot counts for a specific item across dates

### Attributes
- `countKey` (String) - Composite identifier (e.g., "item123-lunch-2024-01-15")
- `itemId` (String) - Item identifier
- `slot` (String) - Time slot (lunch/dinner)
- `date` (String) - Date in YYYY-MM-DD format
- `currentCount` (Number) - Current number of orders for this item/slot/date
- `lastResetTimestamp` (String) - When the count was last reset

### Special Features
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **Removal Policy**: DESTROY (for development)
- **Lazy Reset**: Counts reset on first request of a new day
- **Atomic Updates**: Uses conditional expressions to prevent race conditions

---

## Access Patterns

### Search by Order ID
```
Table: OrderTable
Pattern: orderId = "order123"
```

### Query Customer Order History
```
Table: OrderTable
Index: customerPhone-createdAt-index
Pattern: customerPhone = "+919876543210"
Sort: ScanIndexForward = false (most recent first)
```

### Query Orders by Status
```
Table: OrderTable
Index: status-createdAt-index
Pattern: status = "CREATED"
Sort: ScanIndexForward = false (most recent first)
```

### Query Orders by Status with Date Filter
```
Table: OrderTable
Index: status-createdAt-index
Pattern: status = "CREATED"
Filter: slotDate = "2024-01-15"
Sort: ScanIndexForward = false
```

### Query Orders by Date and Slot
```
Table: OrderTable
Index: slotDate-slot-index
Pattern: slotDate = "2024-01-15" AND slot = "lunch"
```

### Query Orders by Date (All Slots)
```
Table: OrderTable
Index: slotDate-slot-index
Pattern: slotDate = "2024-01-15"
```

### Pagination Example
```javascript
// First page
{
  IndexName: 'status-createdAt-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: { ':status': 'CREATED' },
  Limit: 20,
  ScanIndexForward: false
}

// Next page using LastEvaluatedKey from previous response
{
  IndexName: 'status-createdAt-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: { ':status': 'CREATED' },
  Limit: 20,
  ExclusiveStartKey: previousResponse.LastEvaluatedKey,
  ScanIndexForward: false
}
```

### Get Order History
```
Table: OrderHistoryTable
Pattern: orderId = "order123" (returns all changes sorted by timestamp)
```

### Check Global Killswitch
```
Table: OrderLimitsConfigTable
Index: killswitch-index
Pattern: configType = "GLOBAL"
```

### Get Item Order Counts by Date
```
Table: ItemOrderCountTable
Index: itemId-date-index
Pattern: itemId = "item123" AND date BETWEEN "2024-01-01" AND "2024-01-31"
```

### Get Current Day Count for Item/Slot
```
Table: ItemOrderCountTable
Pattern: countKey = "item123-lunch-2024-01-15"
```

---

## Billing and Performance

All tables use:
- **Billing Mode**: PAY_PER_REQUEST (on-demand pricing)
- **No provisioned capacity**: Automatically scales with traffic
- **Cost**: Charged per read/write request

### Cost Optimization Tips
- Use GSI queries instead of scans
- Batch operations where possible
- Cache frequently accessed data (e.g., item limits)
- Consider TTL for old order history records in production

---

## Data Retention

Current configuration uses `RemovalPolicy.DESTROY` for development environments. For production:
- Consider `RemovalPolicy.RETAIN` for critical tables
- Implement Point-in-Time Recovery (PITR)
- Enable automated backups
- Set up TTL for OrderHistoryTable to auto-delete old records
