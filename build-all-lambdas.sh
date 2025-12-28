#!/bin/bash
set -e

echo "🔍 Building all Lambda functions..."

# Find all Lambda directories with package.json
LAMBDA_DIRS=$(find lambda -maxdepth 2 -type f -name "package.json" -exec dirname {} \; | sort -u)

if [ -z "$LAMBDA_DIRS" ]; then
  echo "⚠️ No Lambda functions found"
  exit 0
fi

echo "📦 Found Lambda functions:"
echo "$LAMBDA_DIRS"
echo ""

# Build each Lambda
for LAMBDA_DIR in $LAMBDA_DIRS; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔨 Building: $LAMBDA_DIR"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  cd "$LAMBDA_DIR"
  
  # Install dependencies
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
  
  # Build
  if npm run | grep -q "\\bbuild\\b"; then
    npm run build
  else
    echo "  ⚠️ No build script, skipping"
  fi
  
  # Test
  if npm run | grep -q "\\btest\\b"; then
    npm run test
  fi
  
  cd - > /dev/null
  echo "✅ Completed: $LAMBDA_DIR"
  echo ""
done

echo "✅ All Lambda functions built successfully"