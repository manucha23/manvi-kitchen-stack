# Create Order API - Corrected Schema

## Endpoint
```
POST /orders
```

## Request Body

```json
{
  "customerName": "Rajesh Kumar",
  "customerPhone": "+919876543210",
  "deliveryAddress": "123, MG Road, Bangalore, Karnataka - 560001",
  "slot": "lunch",
  "slotDate": "2024-05-20",
  "items": [
    {
      "id": "b7eac195-538f-4830-9c76-b483603dd89b",
      "quantity": 2
    }
  ],
  "instructions": "Please ring the doorbell twice"
}
```

## Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customerName` | String | Yes | Customer full name |
| `customerPhone` | String | Yes | Contact number with country code |
| `deliveryAddress` | String | Yes | Full delivery address |
| `slot` | Enum | Yes | Must be "lunch" or "dinner" |
| `slotDate` | String | Yes | Date in YYYY-MM-DD format (today or future) |
| `items` | Array | Yes | List of items to order |
| `items[].id` | String | Yes | Item UUID from ItemTable |
| `items[].quantity` | Number | Yes | Positive integer |
| `instructions` | String | No | Special instructions for the order |

## Valid Slot Values

```typescript
enum Slot {
  LUNCH = "lunch",
  DINNER = "dinner"
}
```

**Note:** No day-specific slots (Saturday/Sunday). Any date can have lunch or dinner orders.

## Validation Rules

1. **slotDate** must be today or in the future
2. **slot** must be exactly "lunch" or "dinner" (lowercase)
3. **items** must contain at least one item
4. **quantity** must be a positive integer
5. **customerPhone** should include country code (e.g., +91)
6. Items are validated against ItemTable for existence and availability
7. Order limits are checked against OrderLimitsConfigTable

## Backend Processing

The backend will:
1. Validate all fields
2. Fetch item details from ItemTable (name, price, availability)
3. Check order limits for each item/slot/date combination
4. Calculate total amount automatically
5. Increment order counts in ItemOrderCountTable
6. Create order with status "CREATED"
7. Set createdAt and updatedAt timestamps

## Response (Success - 201)

```json
{
  "orderId": "order-1705747200000-abc123",
  "orderedBy": "user-sub-from-cognito",
  "customerName": "Rajesh Kumar",
  "customerPhone": "+919876543210",
  "deliveryAddress": "123, MG Road, Bangalore, Karnataka - 560001",
  "status": "CREATED",
  "slot": "lunch",
  "slotDate": "2024-05-20",
  "items": [
    {
      "itemId": "b7eac195-538f-4830-9c76-b483603dd89b",
      "name": "Chicken Biryani",
      "price": 250,
      "quantity": 2,
      "amount": 500
    }
  ],
  "totalAmount": 500,
  "instructions": "Please ring the doorbell twice",
  "createdAt": "2024-05-15T10:30:00.000Z",
  "updatedAt": "2024-05-15T10:30:00.000Z"
}
```

## Error Responses

### 400 - Validation Error
```json
{
  "error": "Missing required fields: customerName, customerPhone, deliveryAddress, slot, slotDate, items"
}
```

```json
{
  "error": "Invalid slot. Must be one of: lunch, dinner"
}
```

```json
{
  "error": "slotDate must be in YYYY-MM-DD format"
}
```

```json
{
  "error": "slotDate must be today or in the future"
}
```

```json
{
  "error": "Item b7eac195-538f-4830-9c76-b483603dd89b not found"
}
```

```json
{
  "error": "Item Chicken Biryani is not available"
}
```

```json
{
  "error": "Order limit reached for this item/slot combination"
}
```

### 401 - Unauthorized
```json
{
  "error": "User not authenticated"
}
```

### 500 - Server Error
```json
{
  "error": "Failed to create order"
}
```

## Examples

### Lunch Order
```json
{
  "customerName": "Priya Sharma",
  "customerPhone": "+919123456789",
  "deliveryAddress": "456, Koramangala, Bangalore - 560034",
  "slot": "lunch",
  "slotDate": "2024-05-21",
  "items": [
    {
      "id": "item-uuid-1",
      "quantity": 1
    },
    {
      "id": "item-uuid-2",
      "quantity": 3
    }
  ]
}
```

### Dinner Order
```json
{
  "customerName": "Amit Patel",
  "customerPhone": "+919988776655",
  "deliveryAddress": "789, Whitefield, Bangalore - 560066",
  "slot": "dinner",
  "slotDate": "2024-05-22",
  "items": [
    {
      "id": "item-uuid-3",
      "quantity": 2
    }
  ],
  "instructions": "Extra spicy, no onions"
}
```

## Order Status Enum

```typescript
enum OrderStatus {
  CREATED = "CREATED",           // Order placed by customer
  CONFIRMED = "CONFIRMED",       // Order confirmed by admin
  INKITCHEN = "INKITCHEN",       // Order is being prepared
  READY = "READY",               // Order is ready for dispatch
  DISPATCHED = "DISPATCHED",     // Order is out for delivery
  COMPLETED = "COMPLETED",       // Order delivered successfully
  CANCELLED = "CANCELLED"        // Order cancelled
}
```

## Order Lifecycle

```
CREATED → CONFIRMED → INKITCHEN → READY → DISPATCHED → COMPLETED
                                    ↓
                              CANCELLED (can happen at any stage)
```

## Key Changes from Previous Version

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `customerPhone` | `customerPhone` | ✅ Correct |
| `contactNumber` | ❌ Removed | Use `customerPhone` |
| `slotDate` | `slotDate` | ✅ Correct (YYYY-MM-DD) |
| `orderScheduled` | ❌ Removed | Use `slotDate` |
| `slot: "saturday-lunch"` | `slot: "lunch"` | No day prefix |
| `items[].itemId` | `items[].id` | Different field name |
| `totalAmount` | ❌ Not in request | Calculated by backend |
| `items[].name` | ❌ Not in request | Fetched from database |
| `items[].price` | ❌ Not in request | Fetched from database |
