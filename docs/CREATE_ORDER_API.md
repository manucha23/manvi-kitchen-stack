# Create Order API

## Endpoint

```http
POST /orders
```

Creates a same-day order for either COD or future online payment.

## Request Body

```json
{
  "customerName": "Rajesh Kumar",
  "customerPhone": "+919876543210",
  "deliveryAddress": "123, MG Road, Pune, Maharashtra - 411028",
  "slot": "lunch",
  "slotDate": "2026-05-12",
  "paymentMethod": "COD",
  "items": [
    {
      "id": "b7eac195-538f-4830-9c76-b483603dd89b",
      "quantity": 2
    }
  ],
  "instructions": "Please ring the doorbell twice"
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customerName` | String | Yes | Customer full name |
| `customerPhone` | String | Yes | Contact number with country code |
| `deliveryAddress` | String | Yes | Full delivery address |
| `slot` | Enum | Yes | `lunch` or `dinner` |
| `slotDate` | String | Yes | Today's date in `Asia/Kolkata`, `YYYY-MM-DD` |
| `paymentMethod` | Enum | No | `COD` or `ONLINE`; defaults to `COD` |
| `items` | Array | Yes | Items to order |
| `items[].id` | String | Yes | Item UUID from `ItemTable` |
| `items[].quantity` | Number | Yes | Positive integer |
| `instructions` | String | No | Special instructions |

Clients must not send item name, price, amount, or order total. The backend fetches item details and calculates totals.

## Slot Rules

- Orders are same-day only in `Asia/Kolkata`.
- `slot` must be exactly `lunch` or `dinner`.
- Lunch accepts orders until configured lunch cutoff, default `13:00` IST.
- Dinner accepts orders until configured dinner cutoff, default `20:00` IST.
- Cutoff fields are configured on the `GLOBAL` record in `ORDER_LIMITS_CONFIG_TABLE`:
  - `lunchCutoffTime`
  - `dinnerCutoffTime`

## Payment and Capacity Behavior

### COD

`paymentMethod = COD` reserves item capacity immediately.

Successful COD order:

- reserves capacity for all requested item quantities
- returns `status = CONFIRMED`
- returns `paymentStatus = NOT_REQUIRED`
- returns `capacityReserved = true`

### ONLINE

`paymentMethod = ONLINE` creates a pending order for later Razorpay integration.

Successful online order:

- does not reserve capacity during create
- returns `status = PENDING_PAYMENT`
- returns `paymentStatus = PENDING`
- returns `capacityReserved = false`

Capacity is reserved later when payment succeeds and the order transitions to `CONFIRMED`.

## Success Response

```json
{
  "orderId": "ABC123",
  "orderedBy": "user-sub-from-cognito",
  "customerName": "Rajesh Kumar",
  "customerPhone": "+919876543210",
  "deliveryAddress": "123, MG Road, Pune, Maharashtra - 411028",
  "status": "CONFIRMED",
  "paymentMethod": "COD",
  "paymentStatus": "NOT_REQUIRED",
  "capacityReserved": true,
  "capacityReservedAt": "2026-05-12T07:00:00.000Z",
  "slot": "lunch",
  "slotDate": "2026-05-12",
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
  "createdAt": "2026-05-12T07:00:00.000Z",
  "updatedAt": "2026-05-12T07:00:00.000Z"
}
```

## Error Examples

```json
{ "error": "Orders are accepted for today only" }
```

```json
{ "error": "Lunch orders are closed for today" }
```

```json
{ "error": "Invalid slot. Must be one of: lunch, dinner" }
```

```json
{ "error": "No order limit configured for this item" }
```

```json
{ "error": "Only 1 order available for this item in lunch" }
```

## Order Status Values

```typescript
enum OrderStatus {
  PENDING_PAYMENT = "PENDING_PAYMENT",
  CONFIRMED = "CONFIRMED",
  INKITCHEN = "INKITCHEN",
  READY = "READY",
  DISPATCHED = "DISPATCHED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}
```

## Order Lifecycle

```text
COD:    POST /orders -> CONFIRMED -> INKITCHEN -> READY -> DISPATCHED -> COMPLETED
ONLINE: POST /orders -> PENDING_PAYMENT -> CONFIRMED -> INKITCHEN -> READY -> DISPATCHED -> COMPLETED

Any reserved order can move to CANCELLED, which releases capacity once.
```
