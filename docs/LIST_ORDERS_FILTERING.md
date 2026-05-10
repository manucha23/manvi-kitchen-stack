# List Orders - Filter Behavior & Performance

## How Filtering Works

### Primary Filters (Key Conditions - Fast)
These use DynamoDB GSI key conditions and are very efficient:

1. **customerPhone** → Uses `customerPhone-createdAt-index`
2. **slotDate** → Uses `slotDate-slot-index`
3. **orderStatus** → Uses `status-createdAt-index`

### Secondary Filters (Filter Expressions - Slower)
These are applied AFTER the query and consume read capacity for filtered-out items:

- `orderStatus` (when querying by customerPhone or slotDate)
- `slot` (when querying by customerPhone or orderStatus)
- `slotDate` (when querying by customerPhone)
- `orderedBy`

## Query Strategy Priority

The Lambda chooses the GSI based on this priority:

```
1. customerPhone (if provided)
2. slotDate (if provided and no customerPhone)
3. orderStatus (if provided and no customerPhone/slotDate)
4. Default: orderStatus=CREATED
```

## Examples with Performance Notes

### ✅ Efficient Queries (Key Conditions Only)

#### Query by customer phone
```
GET /orders?customerPhone=+919454935942
```
- **GSI**: `customerPhone-createdAt-index`
- **Reads**: Only items for this customer
- **Performance**: ⚡ Fast

#### Query by date and slot
```
GET /orders?slotDate=2024-05-20&slot=lunch
```
- **GSI**: `slotDate-slot-index`
- **Reads**: Only items for this date/slot
- **Performance**: ⚡ Fast

#### Query by status
```
GET /orders?orderStatus=COMPLETED
```
- **GSI**: `status-createdAt-index`
- **Reads**: Only COMPLETED orders
- **Performance**: ⚡ Fast

---

### ⚠️ Less Efficient Queries (With Filter Expressions)

#### Customer orders filtered by status
```
GET /orders?customerPhone=+919454935942&orderStatus=COMPLETED
```
- **GSI**: `customerPhone-createdAt-index`
- **Key Condition**: customerPhone = '+919454935942'
- **Filter Expression**: status = 'COMPLETED'
- **Reads**: ALL orders for customer, then filters
- **Performance**: 🐢 Slower if customer has many orders

**Example:**
- Customer has 100 orders total
- Only 10 are COMPLETED
- DynamoDB reads all 100, returns 10
- You pay for 100 read capacity units

#### Date orders filtered by status
```
GET /orders?slotDate=2024-05-20&orderStatus=CONFIRMED
```
- **GSI**: `slotDate-slot-index`
- **Key Condition**: slotDate = '2024-05-20'
- **Filter Expression**: status = 'CONFIRMED'
- **Reads**: ALL orders for this date, then filters
- **Performance**: 🐢 Slower if many orders on this date

---

## Optimization Strategies

### Strategy 1: Use Primary Filter for Most Selective Attribute

**Bad:**
```
GET /orders?customerPhone=+919454935942&orderStatus=COMPLETED
```
If customer has 100 orders, reads all 100.

**Better (if possible):**
```
GET /orders?orderStatus=COMPLETED
```
Then filter by customerPhone in your application code.

**When to use:** If COMPLETED orders are fewer than customer's total orders.

---

### Strategy 2: Pagination with Filters

When using filter expressions, pagination works differently:

```
GET /orders?customerPhone=+919454935942&orderStatus=COMPLETED&limit=20
```

**What happens:**
1. DynamoDB reads up to 20 items from GSI (all statuses)
2. Applies filter (status = COMPLETED)
3. Returns matching items (might be < 20)
4. If < 20 matches, provides nextToken to continue

**Result:** You might get 5 results even with limit=20 if only 5 out of 20 read items matched the filter.

---

### Strategy 3: Client-Side Filtering for Small Datasets

If you know the result set is small, fetch all and filter client-side:

```javascript
// Fetch all customer orders
const response = await fetch('/orders?customerPhone=+919454935942&limit=100');
const allOrders = response.items;

// Filter client-side
const completedOrders = allOrders.filter(o => o.status === 'COMPLETED');
```

**When to use:** Customer has < 100 orders total.

---

## Real-World Scenarios

### Scenario 1: Customer Order History Page

**Requirement:** Show customer's COMPLETED orders

**Option A: Filter on server**
```
GET /orders?customerPhone=+919454935942&orderStatus=COMPLETED&limit=20
```
- Pros: Simple API call
- Cons: Inefficient if customer has many non-COMPLETED orders

**Option B: Fetch all, filter client-side**
```
GET /orders?customerPhone=+919454935942&limit=100
```
- Pros: Single query, efficient read
- Cons: More data transfer, client-side filtering

**Recommendation:** Use Option A for simplicity unless performance becomes an issue.

---

### Scenario 2: Kitchen Dashboard

**Requirement:** Show all INKITCHEN orders for today's lunch

**Option A: Query by status, filter by date/slot**
```
GET /orders?orderStatus=INKITCHEN&slotDate=2024-05-20&slot=lunch
```
- **GSI**: `status-createdAt-index`
- **Filter**: slotDate and slot
- **Performance**: 🐢 Reads all INKITCHEN orders across all dates

**Option B: Query by date/slot, filter by status**
```
GET /orders?slotDate=2024-05-20&slot=lunch&orderStatus=INKITCHEN
```
- **GSI**: `slotDate-slot-index`
- **Filter**: status
- **Performance**: ⚡ Reads only today's lunch orders

**Recommendation:** Use Option B - more selective primary filter.

---

### Scenario 3: Admin Reports

**Requirement:** All COMPLETED orders in May 2024

**Query:**
```
GET /orders?orderStatus=COMPLETED&fromDate=2024-05-01&toDate=2024-05-31
```
- **GSI**: `status-createdAt-index`
- **Key Condition**: status = 'COMPLETED' AND createdAt BETWEEN dates
- **Performance**: ⚡ Very efficient - both conditions in key

**Recommendation:** Perfect use case - both filters are in the GSI key.

---

## Filter Expression Limitations

### ❌ Cannot Use Multiple Primary Filters

**This doesn't work as expected:**
```
GET /orders?customerPhone=+919454935942&slotDate=2024-05-20
```

**What happens:**
- Uses `customerPhone-createdAt-index` (priority 1)
- `slotDate` becomes a filter expression
- Reads ALL customer orders, filters by date

**Workaround:** Choose the most selective filter as primary.

---

### ❌ Filter Expressions Don't Reduce Read Costs

```
GET /orders?customerPhone=+919454935942&orderStatus=COMPLETED
```

If customer has 1000 orders and only 50 are COMPLETED:
- **Read Capacity Units**: Charged for 1000 items
- **Data Transfer**: Only 50 items returned
- **Cost**: Same as fetching all 1000 orders

---

## Best Practices

### 1. Choose the Right Primary Filter

Ask yourself: "Which filter will return the fewest items?"

- Few customers, many orders per customer → Use `customerPhone`
- Many orders per day → Use `orderStatus` instead of `slotDate`
- Few orders per status → Use `orderStatus`

### 2. Use Date Ranges in Key Conditions

**Good:**
```
GET /orders?orderStatus=COMPLETED&fromDate=2024-05-01&toDate=2024-05-31
```
Date range is part of the key condition (createdAt).

**Bad:**
```
GET /orders?customerPhone=+919454935942&slotDate=2024-05-20
```
slotDate is a filter expression, not in the key.

### 3. Paginate Carefully with Filters

When using filter expressions, you might need multiple pages to get enough results:

```javascript
let allResults = [];
let nextToken = null;

do {
  const url = `/orders?customerPhone=+919454935942&orderStatus=COMPLETED&limit=20${nextToken ? `&nextToken=${nextToken}` : ''}`;
  const response = await fetch(url);
  
  allResults.push(...response.items);
  nextToken = response.nextToken;
  
  // Stop if we have enough results
  if (allResults.length >= 20) break;
  
} while (nextToken);
```

### 4. Monitor Performance

If queries become slow:
1. Check CloudWatch metrics for consumed read capacity
2. Consider adding a new GSI for common filter combinations
3. Use client-side filtering for small datasets

---

## Summary

| Query Pattern | Primary Filter | Secondary Filters | Performance |
|---------------|----------------|-------------------|-------------|
| `?customerPhone=X` | customerPhone | - | ⚡⚡⚡ |
| `?customerPhone=X&orderStatus=Y` | customerPhone | orderStatus | ⚡⚡ |
| `?slotDate=X&slot=Y` | slotDate + slot | - | ⚡⚡⚡ |
| `?slotDate=X&orderStatus=Y` | slotDate | orderStatus | ⚡⚡ |
| `?orderStatus=X` | orderStatus | - | ⚡⚡⚡ |
| `?orderStatus=X&fromDate=Y&toDate=Z` | orderStatus + dates | - | ⚡⚡⚡ |

**Legend:**
- ⚡⚡⚡ = Very fast (key conditions only)
- ⚡⚡ = Moderate (includes filter expressions)
- ⚡ = Slow (multiple filter expressions)
