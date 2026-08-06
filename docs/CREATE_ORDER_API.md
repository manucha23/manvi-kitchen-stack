# Create Order API

`POST /orders` creates an order when the kitchen is currently accepting orders.

## Request

```json
{
  "customerName": "Manvi",
  "customerPhone": "+917042622062",
  "deliveryAddress": "Kumar Picasso, Hadapsar, Pune - 411028",
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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customerName` | String | Yes | Customer full name |
| `customerPhone` | String | Yes | Contact number |
| `deliveryAddress` | String | Yes | Full delivery address |
| `paymentMethod` | Enum | No | `COD` or `ONLINE`; defaults to `COD` |
| `items` | Array | Yes | Items to order |
| `items[].id` | String | Yes | Item UUID from `ItemTable` |
| `items[].quantity` | Number | Yes | Positive integer |
| `instructions` | String | No | Special instructions |

Clients do not send slot, slot date, item name, price, amount, order total, or delivery promise. The backend fetches item details, calculates totals, and assigns `promisedDeliveryAt`.

## Ordering Rules

- Orders are accepted only when global ordering is enabled.
- Orders are accepted only between configured `openTime` and `closeTime` in `Asia/Kolkata`.
- Defaults are `11:00` to `21:00`.
- Successful orders receive `promisedDeliveryAt = createdAt + deliveryPromiseMinutes`.
- Default `deliveryPromiseMinutes` is `60`.
- Each item must exist and be marked `available = true`.

## Response

```json
{
  "orderId": "ORD-20260512-0001",
  "orderedBy": "user-sub",
  "customerName": "Manvi",
  "customerPhone": "+917042622062",
  "deliveryAddress": "Kumar Picasso, Hadapsar, Pune - 411028",
  "status": "CREATED",
  "paymentMethod": "COD",
  "paymentStatus": "NOT_REQUIRED",
  "promisedDeliveryAt": "2026-05-12T07:00:00.000Z",
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
  "createdAt": "2026-05-12T06:00:00.000Z",
  "updatedAt": "2026-05-12T06:00:00.000Z"
}
```

COD orders are created in `CREATED` status, which the admin UI displays as "Order Placed". Admin confirmation moves the order to `CONFIRMED`.

## Error Examples

```json
{ "error": "Orders are accepted between 11:00 and 21:00 IST" }
```

```json
{ "error": "Ordering is temporarily disabled" }
```

```json
{ "error": "Item Chicken Biryani is not available" }
```
