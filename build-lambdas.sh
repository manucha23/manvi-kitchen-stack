#!/bin/bash

# Build script for Lambda functions
set -e

echo "Building Lambda functions..."

# Build orders Lambda
echo "Building orders Lambda..."
cd lambda/orders
npm ci
npm run build
cd ../..

# Build items Lambda  
echo "Building items Lambda..."
cd lambda/items
npm ci
npm run build
cd ../..

echo "Lambda functions built successfully!"