# Day 1 Order Capacity Reservation

## Overview

This project does not implement ingredient-level inventory for Day 1. It implements item capacity reservation:

- limits are configured per menu item for lunch and dinner
- capacity is tracked per `itemId + slot + slotDate`
- `availableCount` is stored so the UI can disable sold-out choices without recalculating
- orders are accepted for same-day slots only in `Asia/Kolkata`
- lunch closes at `13:00` IST by default
- dinner closes at `20:00` IST by default
- cutoff times are configurable from the `GLOBAL` record in `ORDER_LIMITS_CONFIG_TABLE`

This keeps the first launch simple while preventing overselling Biryani or Chicken Tikka portions.

## Tables

### Orders Table

Stores customer orders and capacity reservation state.

Important attributes:

- `orderId`
- `orderedBy`
- `customerName`
- `customerPhone`
- `deliveryAddress`
- `slot` (`lunch` or `dinner`)
- `slotDate` (`YYYY-MM-DD`, same-day IST only)
- `items`
- `totalAmount`
- `status`
- `paymentMethod` (`COD` or `ONLINE`)
- `paymentStatus` (`NOT_REQUIRED` or `PENDING`)
- `capacityReserved`
- `capacityReservedAt`
- `createdAt`
- `updatedAt`

### Order Limits Config Table

Stores capacity configuration.

Per-item record:

```typescript
interface ItemCapacityConfig {
  itemId: string;
  itemName?: string;
  lunchLimit?: number;
  dinnerLimit?: number;
  isAcceptingOrders?: boolean;
  updatedAt: string;
}
```

Global record:

```typescript
interface GlobalCapacityConfig {
  itemId: 'GLOBAL';
  globalKillswitch?: boolean;
  lunchCutoffTime?: string;  // HH:mm, default 13:00
  dinnerCutoffTime?: string; // HH:mm, default 20:00
  updatedAt: string;
}
```

### Item Order Count Table

Stores current same-day capacity usage per item and slot.

```typescript
interface ItemOrderCount {
  countKey: string;          // {itemId}-{slot}-{YYYY-MM-DD}
  itemId: string;
  slot: 'lunch' | 'dinner';
  date: string;              // YYYY-MM-DD in Asia/Kolkata
  currentCount: number;      // Reserved portions
  availableCount: number;    // Remaining portions
  lastResetTimestamp: string;
  updatedAt: string;
  ttl: number;               // Unix seconds, 48 hours after slot date
}
```

`availableCount` is intentionally stored for fast UI decisions. It must always be updated atomically with `currentCount`.

## Slot and Cutoff Rules

- `slotDate` must equal today's date in `Asia/Kolkata`.
- `slot` must be exactly `lunch` or `dinner`.
- Lunch orders are accepted until the configured lunch cutoff, default `13:00`.
- Dinner orders are accepted until the configured dinner cutoff, default `20:00`.
- If a cutoff is malformed or missing, the default is used.
- Future-day and past-day orders are rejected for Day 1.

## Payment and Reservation Rules

### COD Orders

COD orders reserve capacity immediately during `POST /orders`.

Successful COD creation:

- validates item limits and cutoffs
- atomically reserves capacity for all items
- creates the order as `CONFIRMED`
- sets `paymentMethod = COD`
- sets `paymentStatus = NOT_REQUIRED`
- sets `capacityReserved = true`

If capacity reservation fails, the order must not be created as confirmed.

### ONLINE Orders

Online orders are created without capacity reservation.

Successful online creation:

- validates item existence, availability, limits, same-day date, and cutoff
- creates the order as `PENDING_PAYMENT`
- sets `paymentMethod = ONLINE`
- sets `paymentStatus = PENDING`
- sets `capacityReserved = false`

When Razorpay payment succeeds later, the order should transition to `CONFIRMED`. That transition reserves capacity if it has not already been reserved.

## Atomic Capacity Updates

Reservation must be atomic per item count record:

```text
currentCount = currentCount + quantity
availableCount = availableCount - quantity
condition: availableCount >= quantity
```

When the count record is missing:

1. read the configured item limit for the requested slot
2. create the count record with:
   - `currentCount = 0`
   - `availableCount = limit`
   - `ttl = slotDate + 48 hours`
3. reserve from that initialized record using the same atomic condition

Duplicate item IDs in one order must be aggregated before reservation.

## Cancellation and Release

Cancellation releases capacity only if `capacityReserved = true`.

Release behavior:

- decrement `currentCount` by the reserved quantity
- increment `availableCount` by the reserved quantity
- prevent `currentCount` from going below zero
- set `capacityReserved = false`

Repeated cancellation must be idempotent and must not increase availability twice.

## Availability API

The UI needs availability to disable sold-out item/slot choices.

### Single Item Availability

```http
GET /items/{itemId}/availability?slot=lunch
```

Response:

```json
{
  "itemId": "item-123",
  "slot": "lunch",
  "slotDate": "2026-05-12",
  "limit": 20,
  "currentCount": 7,
  "availableCount": 13,
  "isAcceptingOrders": true,
  "globalKillswitch": false,
  "cutoffTime": "13:00",
  "cutoffPassed": false,
  "available": true
}
```

### Item Reads

`GET /items` and `GET /items/{itemId}` should include today's lunch and dinner availability for each item, derived from config and count records.

If a count record does not exist, availability falls back to:

- `currentCount = 0`
- `availableCount = configured limit`

## Rejection Examples

- `Orders are accepted for today only`
- `Lunch orders are closed for today`
- `Dinner orders are closed for today`
- `Order acceptance is temporarily disabled`
- `This item is not accepting orders at the moment`
- `No order limit configured for this item`
- `Only 2 orders available for this item in lunch`

## Day 1 Boundaries

Included:

- item-level portion limits
- same-day slot cutoffs
- COD immediate reservation
- ONLINE pending order support for future Razorpay
- manual killswitches
- stored `availableCount`

Not included:

- ingredient inventory
- recipe/batch planning
- automatic procurement
- future-day preorder capacity
- Razorpay webhook implementation
