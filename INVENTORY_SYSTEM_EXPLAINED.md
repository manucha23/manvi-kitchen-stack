# Inventory Management & Blocking System

## Overview

The inventory management system uses a **loosely coupled architecture** with automatic slot opening, inventory blocking, and TTL-based auto-reversal to prevent overselling while handling order cancellations gracefully.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INVENTORY MANAGEMENT FLOW                        │
└─────────────────────────────────────────────────────────────────────┘

1. SLOT OPENING (Weekly - Monday 00:00 UTC)
   ┌──────────────────────────────────────────────────────────────┐
   │  EventBridge Scheduler                                       │
   │  └─> Slot Management Lambda                                  │
   │      └─> Scans ItemTable                                     │
   │          └─> Creates SlotAvailabilityTable records           │
   │              • itemId#saturday-lunch#2024-01-20              │
   │              • itemId#saturday-dinner#2024-01-20             │
   │              • itemId#sunday-lunch#2024-01-21                │
   │              • itemId#sunday-dinner#2024-01-21               │
   │              Each with: availableQuantity = 10               │
   └──────────────────────────────────────────────────────────────┘

2. ORDER PLACEMENT (Customer orders)
   ┌──────────────────────────────────────────────────────────────┐
   │  Customer → API Gateway → Orders Lambda                      │
   │  └─> Validates schedule exists in SlotAvailabilityTable      │
   │  └─> Validates items exist and are available                 │
   │  └─> Creates order (status: Created)                         │
   │  └─> NO INVENTORY BLOCKING (Currently not implemented)       │
   └──────────────────────────────────────────────────────────────┘

3. INVENTORY BLOCKING (Available but NOT currently used)
   ┌──────────────────────────────────────────────────────────────┐
   │  blockInventory() function exists but NOT called             │
   │  If implemented, would:                                      │
   │  1. Reduce availableQuantity in SlotAvailabilityTable        │
   │  2. Create BLOCKED record in InventoryTable with TTL         │
   │  3. Set TTL = 15 minutes from now                            │
   └──────────────────────────────────────────────────────────────┘

4. ORDER CONFIRMATION (Admin confirms)
   ┌──────────────────────────────────────────────────────────────┐
   │  Admin → PUT /orders/{orderId} {orderStatus: "Accepted"}     │
   │  └─> Updates order status                                    │
   │  └─> confirmInventory() would delete BLOCKED records         │
   │      (if blocking was implemented)                           │
   └──────────────────────────────────────────────────────────────┘

5. AUTO-REVERSAL (TTL expires after 15 min)
   ┌──────────────────────────────────────────────────────────────┐
   │  DynamoDB TTL expires → Deletes BLOCKED record               │
   │  └─> DynamoDB Stream triggers TTL Cleanup Lambda             │
   │      └─> Restores availableQuantity in SlotAvailabilityTable │
   └──────────────────────────────────────────────────────────────┘
```

## Database Tables

### 1. SlotAvailabilityTable
**Purpose**: Track available inventory per item per slot per date

**Schema**:
```typescript
{
  slotKey: "itemId#slot#date",        // PK: "uuid#saturday-lunch#2024-01-20"
  itemId: "uuid",
  itemName: "Biryani",
  slot: "saturday-lunch",
  date: "2024-01-20",
  availableQuantity: 7,               // Current available
  totalQuantity: 10,                  // Original quantity
  createdAt: "2024-01-15T00:00:00Z"
}
```

**Operations**:
- Created by: Slot Management Lambda (weekly)
- Read by: Orders Lambda (validation), Items Lambda (display)
- Updated by: Inventory Service (blocking/releasing)

### 2. InventoryTable (Temporary Blocks)
**Purpose**: Track temporary inventory blocks with auto-expiry

**Schema**:
```typescript
{
  slotKey: "itemId#slot#date",       // PK
  blockId: "orderId#itemId",         // SK
  orderId: "A3K9M2",
  itemId: "uuid",
  slot: "saturday-lunch",
  date: "2024-01-20",
  quantity: 2,
  status: "BLOCKED",                 // Only BLOCKED (no CONFIRMED)
  blockedAt: "2024-01-15T10:30:00Z",
  ttl: 1705318800                    // Unix timestamp (15 min from blockedAt)
}
```

**Features**:
- TTL enabled (auto-deletes after 15 minutes)
- DynamoDB Streams enabled (triggers cleanup lambda)
- Only stores BLOCKED records (confirmed orders delete the record)

### 3. OrderTable
**Purpose**: Store order details

**Schema**:
```typescript
{
  orderId: "A3K9M2",                 // PK (auto-generated)
  orderedBy: "user-sub-123",         // From Cognito
  customerName: "John Doe",
  deliveryAddress: "123 Main St",
  contactNumber: "+1234567890",
  orderStatus: "Created",            // Created|Accepted|Cooking|Ready|Delivered
  orderScheduled: "2024-01-20T18:00:00Z",
  timestamp: "2024-01-15T10:30:00Z",
  items: [
    {
      id: "item-uuid",
      name: "Biryani",
      price: 250,
      quantity: 2,
      amount: 500
    }
  ],
  total: 500,
  instructions: "Ring doorbell",
  feedbackProvided: false,
  feedbackRequestCount: 0
}
```

### 4. ItemTable
**Purpose**: Store menu items

**Schema**:
```typescript
{
  itemId: "uuid",                    // PK
  name: "Biryani",
  description: "Delicious chicken biryani",
  price: 250,
  category: "Main Course",
  imageUrl: "https://cdn.example.com/biryani.jpg",
  available: true
}
```

## Lambda Functions

### 1. Slot Management Lambda
**Trigger**: EventBridge (Monday 00:00 UTC)

**Function**:
```typescript
1. Calculate next Saturday/Sunday dates
2. Scan all items from ItemTable
3. For each item, create 4 slot records:
   - saturday-lunch
   - saturday-dinner
   - sunday-lunch
   - sunday-dinner
4. Set availableQuantity = 10 (default)
5. Skip if slot already exists
```

**Environment Variables**:
- `ITEM_TABLE`
- `SLOT_AVAILABILITY_TABLE`

### 2. Orders Lambda
**Trigger**: API Gateway (REST API)

**Current Implementation** (Inventory blocking NOT active):
```typescript
POST /orders:
1. Extract user from Cognito JWT
2. Validate required fields
3. Validate schedule exists in SlotAvailabilityTable
4. Validate items exist and are available
5. Calculate item amounts and order total
6. Create order (status: Created)
7. Return order

// NOTE: Inventory blocking functions exist but are NOT called
```

**Available Functions** (not currently used):
- `blockInventory()` - Reduce quantity and create BLOCKED record
- `checkAvailability()` - Check if quantity available
- `confirmInventory()` - Delete BLOCKED records on confirmation
- `releaseInventory()` - Restore quantity and delete BLOCKED records

**Environment Variables**:
- `ORDER_TABLE`
- `ITEM_TABLE`
- `SLOT_AVAILABILITY_TABLE`
- `INVENTORY_TABLE`

### 3. TTL Cleanup Lambda
**Trigger**: DynamoDB Stream (InventoryTable)

**Function**:
```typescript
1. Listen to DynamoDB Stream events
2. Filter for REMOVE events (TTL deletions)
3. Check if status = "BLOCKED"
4. Extract itemId, slot, date, quantity
5. Restore availableQuantity in SlotAvailabilityTable
6. Log restoration
```

**Why it works**:
- Only BLOCKED records have TTL
- Confirmed orders delete the record immediately (no TTL trigger)
- Cancelled orders let TTL expire naturally

**Environment Variables**:
- `SLOT_AVAILABILITY_TABLE`

### 4. Items Lambda
**Trigger**: API Gateway (REST API)

**Function**:
```typescript
GET /items:
1. Scan ItemTable
2. For each item, fetch slot availability
3. Return items with slotAvailability object
4. Include isAvailable boolean per slot
```

## Current State vs Intended Design

### ❌ Current Implementation (Inventory Blocking NOT Active)

```
Customer places order
  ↓
Validate schedule exists ✅
  ↓
Validate items exist ✅
  ↓
Create order ✅
  ↓
NO inventory blocking ❌
  ↓
Multiple customers can order same slot ❌
```

**Problem**: No inventory blocking means overselling is possible.

### ✅ Intended Design (With Inventory Blocking)

```
Customer places order
  ↓
Validate schedule exists ✅
  ↓
Check availability (checkAvailability) ✅
  ↓
Block inventory (blockInventory) ✅
  • Reduce availableQuantity atomically
  • Create BLOCKED record with TTL
  ↓
Create order ✅
  ↓
Wait for confirmation (15 min window)
  ↓
  ├─> Admin confirms → Delete BLOCKED record ✅
  │   Quantity stays reduced ✅
  │
  └─> TTL expires → Auto-restore quantity ✅
      DynamoDB Stream → TTL Cleanup Lambda ✅
```

## How to Enable Inventory Blocking

### Step 1: Update create-order.handler.ts

```typescript
// Add import
import { blockInventory, checkAvailability } from '../services';

// In createOrder function, after item validation:
for (const requestItem of items) {
  const item = itemsMap.get(requestItem.id);
  
  // ... existing validation ...
  
  // ADD THIS: Check availability
  const scheduleDate = orderScheduled.split('T')[0];
  const slot = 'saturday-lunch'; // Extract from orderScheduled
  
  const available = await checkAvailability(
    requestItem.id, 
    slot, 
    scheduleDate, 
    requestItem.quantity
  );
  
  if (!available) {
    return createErrorResponse(400, `Item ${item.name} sold out for this slot`);
  }
}

// After creating order, ADD THIS: Block inventory
for (const orderItem of orderItems) {
  const scheduleDate = orderScheduled.split('T')[0];
  const slot = 'saturday-lunch'; // Extract from orderScheduled
  
  await blockInventory(
    orderItem.id,
    slot,
    scheduleDate,
    orderItem.quantity,
    orderId
  );
}
```

### Step 2: Update update-order.handler.ts

```typescript
// Add import
import { confirmInventory, releaseInventory } from '../services';

// In updateOrder function, after status update:
if (body.orderStatus === 'Accepted') {
  await confirmInventory(orderId);
}

if (body.orderStatus === 'Cancelled') {
  await releaseInventory(orderId);
}
```

### Step 3: Update Order Model

Add slot field to order:
```typescript
export interface Order {
  // ... existing fields ...
  slot: string; // saturday-lunch, saturday-dinner, etc.
}
```

## Flow Diagrams

### Complete Order Flow (With Blocking)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CUSTOMER PLACES ORDER                                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. VALIDATE & CHECK AVAILABILITY                                │
│    • Schedule exists? ✅                                         │
│    • Items exist? ✅                                             │
│    • Quantity available? ✅                                      │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. BLOCK INVENTORY (Atomic)                                     │
│    SlotAvailabilityTable:                                       │
│    availableQuantity: 10 → 8 (reduced by 2)                     │
│                                                                  │
│    InventoryTable:                                              │
│    + New BLOCKED record (TTL: 15 min)                           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CREATE ORDER                                                 │
│    OrderTable:                                                  │
│    + New order (status: Created)                                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    ┌─────┴─────┐
                    │           │
         ┌──────────▼─────┐   ┌▼──────────────┐
         │ ADMIN CONFIRMS │   │ TTL EXPIRES   │
         │ (within 15 min)│   │ (after 15 min)│
         └────────┬───────┘   └┬──────────────┘
                  │             │
                  ▼             ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │ confirmInventory()  │   │ TTL Cleanup Lambda  │
    │ • Delete BLOCKED    │   │ • Restore quantity  │
    │ • Keep reduced qty  │   │ • Auto-reversal     │
    └─────────────────────┘   └─────────────────────┘
```

### Slot Opening Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ MONDAY 00:00 UTC - EventBridge Triggers                         │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Slot Management Lambda                                          │
│ 1. Calculate next Saturday = 2024-01-20                         │
│ 2. Calculate next Sunday = 2024-01-21                           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Scan ItemTable                                                  │
│ Found: [Biryani, Raita, Salad]                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Create Slot Records (SlotAvailabilityTable)                     │
│                                                                  │
│ For Biryani:                                                    │
│ • biryani-uuid#saturday-lunch#2024-01-20 (qty: 10)              │
│ • biryani-uuid#saturday-dinner#2024-01-20 (qty: 10)             │
│ • biryani-uuid#sunday-lunch#2024-01-21 (qty: 10)                │
│ • biryani-uuid#sunday-dinner#2024-01-21 (qty: 10)               │
│                                                                  │
│ Repeat for Raita, Salad...                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Benefits

### 1. Prevents Overselling
- Atomic quantity reduction ensures no race conditions
- Inventory blocked immediately on order placement

### 2. Automatic Cleanup
- No manual intervention needed for expired orders
- TTL + DynamoDB Streams handle everything

### 3. Cost Effective
- No cron jobs or scheduled tasks
- Pay only for actual operations
- Auto-cleanup prevents table bloat

### 4. Loosely Coupled
- Items and inventory are independent
- Easy to adjust quantities without touching items
- Slot management is separate from order processing

### 5. Scalable
- DynamoDB handles high concurrency
- Atomic operations prevent conflicts
- Serverless architecture scales automatically

## Monitoring

### CloudWatch Metrics to Track

1. **SlotAvailabilityTable**
   - Read/Write capacity
   - Throttled requests

2. **InventoryTable**
   - TTL deletions count
   - Stream records processed

3. **TTL Cleanup Lambda**
   - Invocations
   - Errors
   - Duration
   - Quantity restored (custom metric)

4. **Slot Management Lambda**
   - Invocations (should be weekly)
   - Slots created count
   - Errors

### CloudWatch Alarms

- TTL Cleanup Lambda errors > 0
- Slot Management Lambda failures
- InventoryTable stream processing delays

## Troubleshooting

### Issue: Orders placed but inventory not blocked
**Cause**: Inventory blocking not implemented in create-order handler
**Solution**: Follow "How to Enable Inventory Blocking" section

### Issue: Quantity not restored after 15 minutes
**Cause**: TTL Cleanup Lambda not triggered or failing
**Check**: 
- DynamoDB Stream enabled on InventoryTable
- Lambda has correct permissions
- CloudWatch logs for errors

### Issue: Slots not opening on Monday
**Cause**: EventBridge rule not configured or Slot Management Lambda failing
**Check**:
- EventBridge rule exists and is enabled
- Lambda has permissions to read ItemTable
- CloudWatch logs for errors

## Future Enhancements

1. **Real-time Availability Updates**
   - WebSocket API for live inventory updates
   - Push notifications when slots open

2. **Dynamic Quantity Management**
   - Adjust quantities based on demand
   - Predictive inventory allocation

3. **Waitlist System**
   - Queue customers when sold out
   - Auto-notify when slots become available

4. **Multi-region Support**
   - Global tables for disaster recovery
   - Regional inventory management

5. **Analytics Dashboard**
   - Popular items tracking
   - Slot utilization metrics
   - Revenue forecasting
