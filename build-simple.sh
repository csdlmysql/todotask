#!/bin/bash

# Simple Task-Killer Build Script
set -e

echo "🎯 Building Task-Killer (Simple Method)..."

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create dist directory
echo -e "${CYAN}📁 Creating dist directory...${NC}"
mkdir -p dist

# Compile TypeScript to JavaScript
echo -e "${CYAN}🔧 Compiling TypeScript to JavaScript...${NC}"
npx tsc --outDir dist --target es2020 --module commonjs --moduleResolution node --esModuleInterop true --allowSyntheticDefaultImports true --skipLibCheck true src/index-smart.ts || {
    echo -e "${YELLOW}Warning: TypeScript compilation had issues, continuing...${NC}"
}

# Create executable with pkg using compiled JS
echo -e "${CYAN}🔨 Creating executable from compiled JS...${NC}"

# Update package.json to point to compiled JS
cat > dist/package.json << EOF
{
  "name": "task-killer",
  "version": "1.0.0",
  "main": "index-smart.js",
  "bin": {
    "task-killer": "./index-smart.js"
  },
  "pkg": {
    "targets": ["node18-macos-x64", "node18-linux-x64", "node18-win-x64"],
    "assets": ["../src/database/schema.sql"]
  }
}
EOF

# Copy necessary files
echo -e "${CYAN}📋 Copying assets...${NC}"
cp -r src/database dist/ || echo "No database files to copy"
cp .env.example dist/ || echo "No .env.example to copy"

# Build executable using JavaScript files
cd dist
npx pkg . --output ../task-killer

cd ..

if [[ -f "task-killer" ]]; then
    echo -e "${GREEN}✅ Executable created successfully!${NC}"
    ls -lh task-killer
    
    echo -e "${CYAN}📋 Usage:${NC}"
    echo "  ./task-killer"
    echo ""
    echo -e "${YELLOW}To install globally:${NC}"
    echo "  sudo cp task-killer /usr/local/bin/"
    echo "  sudo chmod +x /usr/local/bin/task-killer"
    
else
    echo "❌ Build failed"
    exit 1
fi