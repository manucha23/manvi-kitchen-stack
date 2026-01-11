#!/bin/bash

# Build script for Lambda functions
set -e

echo "Building Lambda functions..."

# Function to check if tests exist and run them
run_tests_if_exist() {
  local lambda_name=$1
  
  if [ -f "package.json" ] && grep -q '"test"' package.json && [ -d "src/__tests__" ]; then
    echo "Running tests for $lambda_name..."
    npm test
    echo "✅ Tests passed for $lambda_name"
  else
    echo "⚠️  No tests found for $lambda_name, skipping..."
  fi
}

# Build orders Lambda
echo "Building orders Lambda..."
cd lambda/orders
npm ci
run_tests_if_exist "orders"
npm run build
cd ../..

# Build items Lambda  
echo "Building items Lambda..."
cd lambda/items
npm ci
run_tests_if_exist "items"
npm run build
cd ../..

# Build ttl-cleanup Lambda
echo "Building ttl-cleanup Lambda..."
cd lambda/ttl-cleanup
npm ci
run_tests_if_exist "ttl-cleanup"
npm run build
cd ../..

# Build slot-management Lambda
echo "Building slot-management Lambda..."
cd lambda/slot-management
npm ci
run_tests_if_exist "slot-management"
npm run build
cd ../..

# Build order-audit Lambda
echo "Building order-audit Lambda..."
cd lambda/order-audit
npm ci
run_tests_if_exist "order-audit"
npm run build
cd ../..

echo "Lambda functions built successfully!"