# Order Acceptance Model

The ordering flow is intentionally simple:

- no customer-selected slot
- no slot date
- no item capacity reservation table
- no lunch/dinner cutoff rules
- the kitchen accepts orders during a configurable daily window
- every accepted order receives a configurable delivery promise

## Global Ordering Config

The existing `OrderLimitsConfigTable` stores the global config on the `GLOBAL` record.

```typescript
interface OrderingConfig {
  itemId: 'GLOBAL';
  isAcceptingOrders?: boolean;
  globalKillswitch?: boolean;
  openTime?: string;                  // HH:mm IST, default 11:00
  closeTime?: string;                 // HH:mm IST, default 21:00
  deliveryPromiseMinutes?: number;    // default 60
  updatedAt: string;
}
```

`globalKillswitch = true` or `isAcceptingOrders = false` disables ordering.

## Order Creation

`POST /orders` validates:

- authenticated user
- global ordering is enabled
- current time in `Asia/Kolkata` is inside `openTime` and `closeTime`
- each item exists
- each item is marked `available = true`
- item quantities are positive integers

The backend assigns:

```text
promisedDeliveryAt = createdAt + deliveryPromiseMinutes
```

## Order Shape

Important order attributes:

- `orderId`
- `orderedBy`
- `customerName`
- `customerPhone`
- `deliveryAddress`
- `status`
- `paymentMethod`
- `paymentStatus`
- `promisedDeliveryAt`
- `items`
- `totalAmount`
- `instructions`
- `createdAt`
- `updatedAt`

## Operational Controls

For launch, the intended controls are:

- global ordering on/off
- opening time
- closing time
- delivery promise minutes
- item availability on/off

If volume grows, throttling can be added later as a separate operational rule, such as max active orders per hour. It does not need to be part of the customer-facing order model.
