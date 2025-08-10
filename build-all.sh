#!/bin/bash

# Build All Task-Killer Versions
# Creates multiple executables for different use cases

set -e

echo "🏗️  Building All Task-Killer Versions..."
echo ""

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

BUILD_DIR="builds"

# Create builds directory
echo -e "${CYAN}📁 Creating builds directory...${NC}"
mkdir -p "$BUILD_DIR"

# Build 1: Smart Version (AI-powered)
echo -e "${CYAN}🧠 Building Smart Version...${NC}"
./build-smart.sh
mv task-killer-smart "$BUILD_DIR/"
mv install-smart.sh "$BUILD_DIR/"
echo -e "${GREEN}✅ Smart version completed${NC}"
echo ""

# Build 2: Simple Version (lightweight)
echo -e "${CYAN}📋 Building Simple Version...${NC}"
./build-bundle.sh
mv task-killer "$BUILD_DIR/task-killer-simple"
echo -e "${GREEN}✅ Simple version completed${NC}"
echo ""

# Build 3: Development wrapper
echo -e "${CYAN}🔧 Creating Development Version...${NC}"
cp task-killer-simple "$BUILD_DIR/task-killer-dev"
echo -e "${GREEN}✅ Development version completed${NC}"
echo ""

# Create comprehensive installer
echo -e "${CYAN}📦 Creating comprehensive installer...${NC}"
cat > "$BUILD_DIR/install-all.sh" << 'EOF'
#!/bin/bash

echo "🏗️  Task-Killer Installer"
echo ""

# Check available versions
VERSIONS=()
[ -f "task-killer-smart" ] && VERSIONS+=("smart")
[ -f "task-killer-simple" ] && VERSIONS+=("simple") 
[ -f "task-killer-dev" ] && VERSIONS+=("dev")

if [ ${#VERSIONS[@]} -eq 0 ]; then
    echo "❌ No executables found"
    exit 1
fi

echo "Available versions:"
for i in "${!VERSIONS[@]}"; do
    case "${VERSIONS[i]}" in
        "smart")
            echo "  $((i+1)). Smart Version - AI-powered with natural language"
            ;;
        "simple") 
            echo "  $((i+1)). Simple Version - Lightweight, basic functionality"
            ;;
        "dev")
            echo "  $((i+1)). Development Version - For testing and development"
            ;;
    esac
done

echo ""
read -p "Choose version to install (1-${#VERSIONS[@]}): " choice

if [[ "$choice" -ge 1 && "$choice" -le ${#VERSIONS[@]} ]]; then
    selected="${VERSIONS[$((choice-1))]}"
    executable="task-killer-$selected"
    
    if [ "$EUID" -eq 0 ]; then
        INSTALL_DIR="/usr/local/bin"
        echo "📦 Installing system-wide to $INSTALL_DIR"
    else
        INSTALL_DIR="$HOME/.local/bin"
        echo "📦 Installing for user to $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR"
    fi
    
    cp "$executable" "$INSTALL_DIR/task-killer"
    chmod +x "$INSTALL_DIR/task-killer"
    
    echo "✅ Installed $selected version as: task-killer"
    echo "🚀 Run: task-killer"
    
else
    echo "❌ Invalid choice"
    exit 1
fi
EOF

chmod +x "$BUILD_DIR/install-all.sh"

# Create README for builds
cat > "$BUILD_DIR/README.md" << 'EOF'
# Task-Killer Build Distribution

This directory contains different versions of Task-Killer for various use cases.

## Available Versions

### 🧠 Smart Version (`task-killer-smart`)
- **Features**: Full AI-powered experience with Gemini integration
- **Requirements**: Node.js 16+, Gemini API key
- **Best for**: Production use, natural language task management
- **Installation**: `./install-smart.sh`

### 📋 Simple Version (`task-killer-simple`)
- **Features**: Basic task management, lighter weight
- **Requirements**: Node.js 16+
- **Best for**: Basic usage, limited resources
- **Installation**: Copy to PATH manually

### 🔧 Development Version (`task-killer-dev`)
- **Features**: Same as simple but with development flags
- **Requirements**: Node.js 16+, project source code
- **Best for**: Development and testing

## Quick Installation

### Option 1: Interactive Installer
```bash
./install-all.sh
```

### Option 2: Manual Installation
```bash
# For smart version
./install-smart.sh

# For simple/dev versions
sudo cp task-killer-simple /usr/local/bin/task-killer
sudo chmod +x /usr/local/bin/task-killer
```

## Usage

All versions support:
- `task-killer --help` - Show help
- `task-killer --version` - Show version
- `task-killer` - Start interactive mode

### Smart Version Additional Features
- Natural language: "create urgent task fix database bug"
- Context memory across sessions
- Advanced analytics: `/stats`, `/export`, `/backup`
- Smart suggestions and follow-ups

### Configuration

Smart version auto-creates config at `~/.task-killer/.env`:
```env
GEMINI_API_KEY=your_key_here
DATABASE_URL=postgresql://localhost:5432/tasks
ENABLE_NOTIFICATIONS=true
```

## Support

- 📖 Documentation: Run `task-killer /help`
- 🐛 Issues: Check project repository
- 💡 Examples: Run `task-killer` and follow prompts
EOF

# Show summary
echo -e "${GREEN}🎉 All builds completed!${NC}"
echo ""
echo -e "${CYAN}📋 Build Summary:${NC}"
ls -lh "$BUILD_DIR/"
echo ""
echo -e "${YELLOW}📖 Usage:${NC}"
echo -e "  cd $BUILD_DIR"
echo -e "  ./install-all.sh                 # Interactive installer"
echo -e "  ./task-killer-smart --help       # Smart version help"
echo -e "  ./task-killer-simple             # Run simple version"
echo ""
echo -e "${GREEN}✨ Distribution ready in $BUILD_DIR/${NC}"