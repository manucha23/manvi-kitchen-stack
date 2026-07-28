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

install_dependencies() {
  if [ ! -d "node_modules" ]; then
    if [ -f "package-lock.json" ]; then
      npm ci
    else
      npm install
    fi
  fi
}

vendor_ordering_core_dependency() {
  local target="node_modules/@manvi-kitchen/ordering-core"

  if [ -d "../../packages/ordering-core/dist" ]; then
    echo "Vendoring ordering-core dependency..."
    rm -rf "$target"
    mkdir -p "$target"
    cp ../../packages/ordering-core/package.json "$target/package.json"
    cp -R ../../packages/ordering-core/dist "$target/dist"
  fi
}

# Build shared ordering core package
echo "Building ordering-core package..."
cd packages/ordering-core
install_dependencies
run_tests_if_exist "ordering-core"
npm run build
cd ../..

# Build orders Lambda
echo "Building orders Lambda..."
cd lambda/orders
install_dependencies
run_tests_if_exist "orders"
npm run build
cd ../..

# Build items Lambda  
echo "Building items Lambda..."
cd lambda/items
install_dependencies
run_tests_if_exist "items"
npm run build
cd ../..

# Build image-processor Lambda
echo "Building image-processor Lambda..."
cd lambda/image-processor
install_dependencies
run_tests_if_exist "image-processor"
npm run build
cd ../..

# Build ttl-cleanup Lambda
echo "Building ttl-cleanup Lambda..."
cd lambda/ttl-cleanup
install_dependencies
run_tests_if_exist "ttl-cleanup"
npm run build
cd ../..

# Build admin Lambda
echo "Building admin Lambda..."
cd lambda/admin
install_dependencies
run_tests_if_exist "admin"
npm run build
cd ../..

# Build auth-session Lambda
echo "Building auth-session Lambda..."
cd lambda/auth-session
install_dependencies
run_tests_if_exist "auth-session"
npm run build
cd ../..

# Build WhatsApp webhook Lambda
echo "Building WhatsApp webhook Lambda..."
cd lambda/whatsapp-webhook
install_dependencies
run_tests_if_exist "whatsapp-webhook"
npm run build
cd ../..

# Build WhatsApp worker Lambda
echo "Building WhatsApp worker Lambda..."
cd lambda/whatsapp-worker
install_dependencies
vendor_ordering_core_dependency
run_tests_if_exist "whatsapp-worker"
npm run build
cd ../..

# Build cart-maintenance Lambda
echo "Building cart-maintenance Lambda..."
cd lambda/cart-maintenance
install_dependencies
vendor_ordering_core_dependency
run_tests_if_exist "cart-maintenance"
npm run build
cd ../..

# Build order-audit Lambda
echo "Building order-audit Lambda..."
cd lambda/order-audit
install_dependencies
run_tests_if_exist "order-audit"
npm run build
cd ../..

# Build order-invoice-email Lambda
echo "Building order-invoice-email Lambda..."
cd lambda/order-invoice-email
install_dependencies
run_tests_if_exist "order-invoice-email"
npm run build
cd ../..

# Build customers Lambda
echo "Building customers Lambda..."
cd lambda/customers
install_dependencies
vendor_ordering_core_dependency
run_tests_if_exist "customers"
npm run build
cd ../..

echo "Lambda functions built successfully!"
