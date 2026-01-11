# Orders Lambda - Unit Testing

## Overview

Comprehensive unit test suite for the orders lambda covering all handlers, services, and utilities.

## Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
src/__tests__/
├── handlers/
│   ├── create-order.test.ts
│   ├── get-order.test.ts
│   ├── list-orders.test.ts
│   ├── update-order.test.ts
│   ├── delete-order.test.ts
│   ├── update-slot-availability.test.ts
│   └── get-order-history.test.ts
├── services/
│   └── inventory.test.ts
├── utils/
│   ├── validation.test.ts
│   └── response.test.ts
└── test-utils.ts
```

## Coverage Goals

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

## Test Categories

### 1. Success Cases
- Valid inputs with expected outputs
- Happy path scenarios

### 2. Validation Cases
- Invalid input formats
- Missing required fields
- Type mismatches
- Boundary conditions

### 3. Edge Cases
- Empty arrays
- Null/undefined values
- Maximum/minimum values
- Special characters

### 4. Error Cases
- DynamoDB errors
- Network failures
- Timeout scenarios

### 5. Business Logic Cases
- Inventory blocking
- Status transitions
- Date validations
- Slot availability

## Mocking Strategy

### AWS SDK Mocking
- Uses `aws-sdk-client-mock` for DynamoDB operations
- Isolated tests without real AWS calls
- Fast execution

### Environment Variables
- Mocked table names
- Configurable test environment

## Running Specific Tests

```bash
# Run specific test file
npm test get-order.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="validation"

# Run with verbose output
npm test -- --verbose
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pre-deployment
- Scheduled builds

## Best Practices

1. **Arrange-Act-Assert**: Clear test structure
2. **Descriptive Names**: Test names explain what they test
3. **Isolated Tests**: No dependencies between tests
4. **Mock External Dependencies**: DynamoDB, external APIs
5. **Test Edge Cases**: Not just happy paths

## Example Test

```typescript
describe('Get Order Handler', () => {
  it('should return order when found', async () => {
    // Arrange
    docClientMock.on(GetCommand).resolves({ Item: mockOrder });

    // Act
    const result = await getOrder('ABC123');

    // Assert
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).orderId).toBe('ABC123');
  });
});
```

## Troubleshooting

### Tests Failing
1. Check mock setup in `beforeEach`
2. Verify environment variables
3. Check DynamoDB mock responses

### Coverage Not Meeting Threshold
1. Add tests for uncovered branches
2. Test error paths
3. Add edge case tests

## Future Enhancements

- [ ] Integration tests with LocalStack
- [ ] E2E tests
- [ ] Performance tests
- [ ] Contract tests
