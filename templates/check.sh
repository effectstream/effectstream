#!/bin/bash
# Dependency checker script
# This script checks for all required dependencies and shows error messages for missing ones.

set -e  # Exit on any error

# Track if any checks failed
FAILED=0

echo "🔍 Checking dependencies..."
echo

# Colors for output
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m' # No Color

print_success() {
    echo "${GREEN}✅ $1${NC}"
}

print_error() {
    echo "${RED}❌ $1${NC}"
    FAILED=1
}

print_warning() {
    # Two spaces because terminals seem not to know this is double-width.
    echo "${YELLOW}⚠️  $1${NC}"
}

# Function to compare semantic versions
# usage: version_ge version1 version2
# returns 0 if version1 >= version2, 1 otherwise
version_ge() {
    test "$(printf '%s\n' "$1" "$2" | sort -V | head -n 1)" = "$2"
}

# Check if curl is installed
echo "Checking curl..."
if command -v curl &> /dev/null; then
    CURL_VERSION=$(curl --version | head -n1 | cut -d' ' -f2)
    print_success "curl is installed (version: $CURL_VERSION)"
else
    print_error "curl is not installed. Please install curl."
fi
echo

# Check if lsof is installed
echo "Checking lsof..."
if command -v lsof &> /dev/null; then
    print_success "lsof is installed"
else
    print_error "lsof is not installed. Please install lsof."
fi
echo

# Check if tmux is installed
echo "Checking tmux..."
if command -v tmux &> /dev/null; then
    print_success "tmux is installed"
else
    print_error "tmux is not installed. Please install tmux."
fi
echo

# Check if bun >= 1.0.0 is installed
echo "Checking bun..."
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    REQUIRED_BUN_VERSION="1.0.0"
    if version_ge "$BUN_VERSION" "$REQUIRED_BUN_VERSION"; then
        print_success "bun is installed (version: $BUN_VERSION) - meets requirement >= $REQUIRED_BUN_VERSION"
    else
        print_error "bun version $BUN_VERSION is installed but version >= $REQUIRED_BUN_VERSION is required. Please upgrade bun."
        echo "🌐 https://bun.sh/docs/installation"
    fi
else
    print_error "bun is not installed. Please install bun >= $REQUIRED_BUN_VERSION."
    echo "🌐 https://bun.sh/docs/installation"
fi
echo

# Check if node >= 22 is installed
echo "Checking node..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

    if [ "$NODE_MAJOR" -ge 22 ]; then
        print_success "node is installed (version: $NODE_VERSION) - meets requirement >= 22"
    else
        print_error "node version $NODE_VERSION is installed but version >= 22 is required. Please upgrade node."
        echo "🌐 https://nodejs.org/en/download"
    fi
else
    print_error "node is not installed. Please install node >= 22."
    echo "🌐 https://nodejs.org/en/download"
fi
echo

# Check for fkill dependencies (platform-specific)
echo "Checking fkill dependencies..."
OS=$(uname -s)
case "$OS" in
    Linux*)
        echo "Detected Linux - checking for 'ss' command..."
        if command -v ss &> /dev/null; then
            print_success "ss command is available (Linux fkill dependency)"
        else
            print_error "ss command is not available. Please install iproute2 package."
        fi
        ;;
    Darwin*)
        echo "Detected macOS - checking for 'lsof' command..."
        if command -v lsof &> /dev/null; then
            print_success "lsof command is available (macOS fkill dependency)"
        else
            print_error "lsof command is not available on macOS. Please install lsof."
        fi
        ;;
    *)
        print_warning "Unknown operating system: $OS. Cannot check fkill dependencies."
        ;;
esac
echo

# Check if forge binary is installed
echo "Checking forge..."
if FORGE_OUTPUT=$(forge --version 2>/dev/null); then
    FORGE_VERSION=$(echo "$FORGE_OUTPUT" | head -n1 | cut -d' ' -f3)
    print_success "forge is installed (version: $FORGE_VERSION)"
else
    print_error "forge is not installed. Please install Foundry (forge)."
    echo "🌐 https://getfoundry.sh/introduction/installation"
fi
echo

# Check if compact binary is installed
echo "Checking compact..."
if COMPACT_OUTPUT=$(compact --version 2>/dev/null); then
    COMPACT_VERSION=$(echo "$COMPACT_OUTPUT" | head -n1 | cut -d' ' -f2)
    print_success "compact is installed (version: $COMPACT_VERSION)"

    # Check if compact compile is working
    echo "Checking compact compile..."
    if COMPACT_COMPILE_OUTPUT=$(compact compile +0.31.0 --version 2>/dev/null); then
        COMPACT_COMPILE_VERSION=$(echo "$COMPACT_COMPILE_OUTPUT" | head -n1)
        print_success "compact compile is working (version: $COMPACT_COMPILE_VERSION)"
        if [ "$COMPACT_COMPILE_VERSION" = "0.31.0" ]; then
            print_success "compact version 0.31.0 is installed"
        else
            print_error "compact version $COMPACT_COMPILE_VERSION is installed but version 0.31.0 is required. Please update compact."
            echo "🌐 https://github.com/midnightntwrk/compact/releases"
        fi
    else
        print_error "compact compile is not working. Please check your compact installation."
        echo "   Consider running \`compact update\`."
    fi
    echo
else
    print_error "compact is not installed. Please install compact."
    echo "🌐 https://github.com/midnightntwrk/compact/releases"
fi
echo

# Final result
echo "================================================"
if [ $FAILED -eq 0 ]; then
    echo "${GREEN}🎉 All dependency checks passed!${NC}"
    exit 0
else
    echo "${RED}💥 Some dependency checks failed. Please install the missing dependencies.${NC}"
    exit 1
fi
