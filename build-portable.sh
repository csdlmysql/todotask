#!/bin/bash

# Portable Task-Killer Builder
# Creates a completely self-contained executable

set -e

echo "📦 Building Portable Smart Task-Killer..."

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create temporary build directory
BUILD_DIR="portable-build"
DIST_DIR="$BUILD_DIR/dist"

echo -e "${CYAN}📁 Creating build directory...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$DIST_DIR"

# Step 1: Compile TypeScript to JavaScript
echo -e "${CYAN}🔧 Compiling TypeScript to JavaScript...${NC}"
npx tsc --target es2020 --module commonjs --outDir "$DIST_DIR" --moduleResolution node --esModuleInterop true --allowSyntheticDefaultImports true --skipLibCheck true --declaration false src/index-smart.ts

# Step 2: Copy essential dependencies
echo -e "${CYAN}📋 Copying dependencies...${NC}"
mkdir -p "$DIST_DIR/node_modules"

# Copy essential modules (only the ones we actually need)
ESSENTIAL_MODULES=(
    "chalk"
    "inquirer" 
    "boxen"
    "ora"
    "cli-table3"
    "dotenv"
    "pg"
    "@google/generative-ai"
    "uuid"
    "node-notifier"
    "node-telegram-bot-api"
)

for module in "${ESSENTIAL_MODULES[@]}"; do
    if [ -d "node_modules/$module" ]; then
        echo "  Copying $module..."
        cp -r "node_modules/$module" "$DIST_DIR/node_modules/"
    fi
done

# Copy database files
echo -e "${CYAN}💾 Copying database files...${NC}"
cp -r src/database "$DIST_DIR/"

# Step 3: Create portable executable
echo -e "${CYAN}🔨 Creating portable executable...${NC}"

cat > task-killer-portable << EOF
#!/bin/bash

# Portable Smart Task-Killer Executable
# This version is completely self-contained

# Get script location
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PORTABLE_ROOT="\$SCRIPT_DIR/portable-dist"

# Extract embedded files on first run
extract_files() {
    if [ ! -d "\$PORTABLE_ROOT" ]; then
        echo "📦 Extracting portable application..."
        mkdir -p "\$PORTABLE_ROOT"
        
        # Extract the embedded tar data
        ARCHIVE_LINE=\$(grep -n "^#ARCHIVE#" "\$0" | cut -d: -f1)
        ARCHIVE_LINE=\$((ARCHIVE_LINE + 1))
        
        tail -n +\$ARCHIVE_LINE "\$0" | base64 -d | tar -xzf - -C "\$PORTABLE_ROOT"
        echo "✅ Extraction complete"
    fi
}

# Setup configuration
setup_config() {
    CONFIG_DIR="\$HOME/.task-killer"
    
    if [ ! -d "\$CONFIG_DIR" ]; then
        echo "📁 Setting up configuration..."
        mkdir -p "\$CONFIG_DIR"
        
        cat > "\$CONFIG_DIR/.env" << 'ENVEOF'
# Smart Task-Killer Configuration
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://localhost:5432/tasks
ENABLE_NOTIFICATIONS=true
ENABLE_CONTEXT_MEMORY=true
ENABLE_SMART_SUGGESTIONS=true
NODE_ENV=production
ENVEOF
        
        echo "✅ Configuration created at: \$CONFIG_DIR/.env"
        echo ""
        echo "⚠️  Please edit your configuration:"
        echo "   \$CONFIG_DIR/.env"
        echo ""
        echo "🔗 Get Gemini API key: https://makersuite.google.com/app/apikey"
        echo ""
    fi
    
    # Load environment
    cd "\$CONFIG_DIR"
    if [ -f ".env" ]; then
        export \$(grep -v '^#' .env | grep -v '^\$' | xargs) 2>/dev/null || true
    fi
}

# Handle arguments
case "\$1" in
    "--help"|"-h")
        echo "🧠 Smart Task-Killer (Portable)"
        echo "Usage: \$0 [--help|--version|--config]"
        exit 0
        ;;
    "--version")
        echo "Smart Task-Killer Portable v1.0.0"
        exit 0
        ;;
    "--config")
        CONFIG_DIR="\$HOME/.task-killer"
        mkdir -p "\$CONFIG_DIR"
        \${EDITOR:-nano} "\$CONFIG_DIR/.env"
        exit 0
        ;;
esac

# Main execution
main() {
    echo "🧠 Smart Task-Killer (Portable)"
    echo "AI-Powered Task Management"
    echo ""
    
    extract_files
    setup_config
    
    # Run the application
    cd "\$PORTABLE_ROOT/dist"
    exec node index-smart.js "\$@"
}

main "\$@"
exit 0

#ARCHIVE#
EOF

# Step 4: Create the archive and embed it
echo -e "${CYAN}📦 Creating embedded archive...${NC}"
cd "$BUILD_DIR"
tar -czf ../portable-data.tar.gz dist/
cd ..

# Encode and append to executable
base64 portable-data.tar.gz >> task-killer-portable
rm portable-data.tar.gz

# Make executable
chmod +x task-killer-portable

# Cleanup
rm -rf "$BUILD_DIR"

echo ""
echo -e "${GREEN}🎉 Portable Smart Task-Killer created!${NC}"
echo ""
echo -e "${BLUE}📋 File created:${NC}"
ls -lh task-killer-portable
echo ""
echo -e "${CYAN}📖 This is a completely self-contained executable${NC}"
echo -e "${CYAN}   It can be copied to any Linux/macOS system with Node.js${NC}"
echo ""
echo -e "${YELLOW}Usage:${NC}"
echo -e "   ./task-killer-portable"
echo -e "   ./task-killer-portable --config"
echo ""
echo -e "${GREEN}✨ Ready to distribute!${NC}"