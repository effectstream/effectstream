
#!/bin/bash

# Dependency checker script
# This script checks for all required dependencies and shows error messages for missing ones

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any checks failed
FAILED=0

echo "🔍 Checking dependencies..."
echo

# Function to print success message
print_success() {
    printf "${GREEN}✅ $1${NC}\n"
}

# Function to print error message
print_error() {
    printf "${RED}❌ $1${NC}\n"
    FAILED=1
}

# Function to print warning message
print_warning() {
    printf "${YELLOW}⚠️  $1${NC}\n"
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

# Check if deno >= 2.4 is installed
echo "Checking deno..."
if command -v deno &> /dev/null; then
    DENO_VERSION=$(deno --version | head -n1 | cut -d' ' -f2)
    # Extract major and minor version numbers
    DENO_MAJOR=$(echo $DENO_VERSION | cut -d'.' -f1)
    DENO_MINOR=$(echo $DENO_VERSION | cut -d'.' -f2)
    
    if [ "$DENO_MAJOR" -gt 2 ] || ([ "$DENO_MAJOR" -eq 2 ] && [ "$DENO_MINOR" -ge 4 ]); then
        print_success "deno is installed (version: $DENO_VERSION) - meets requirement >= 2.4"
    else
        print_error "deno version $DENO_VERSION is installed but version >= 2.4 is required. Please upgrade deno."
    fi
else
    print_error "deno is not installed. Please install deno >= 2.4."
fi
echo

# Check if node >= 22 is installed
echo "Checking node..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    
    if [ "$NODE_MAJOR" -ge 22 ]; then
        print_success "node is installed (version: $NODE_VERSION) - meets requirement >= 22"
    else
        print_error "node version $NODE_VERSION is installed but version >= 22 is required. Please upgrade node."
    fi
else
    print_error "node is not installed. Please install node >= 22."
fi
echo

# Check for dkill dependencies (platform-specific)
echo "Checking dkill dependencies..."
OS=$(uname -s)
case "$OS" in
    Linux*)
        echo "Detected Linux - checking for 'ss' command..."
        if command -v ss &> /dev/null; then
            print_success "ss command is available (Linux dkill dependency)"
        else
            print_error "ss command is not available. Please install iproute2 package."
        fi
        ;;
    Darwin*)
        echo "Detected macOS - checking for 'lsof' command..."
        if command -v lsof &> /dev/null; then
            print_success "lsof command is available (macOS dkill dependency)"
        else
            print_error "lsof command is not available on macOS. Please install lsof."
        fi
        ;;
    *)
        print_warning "Unknown operating system: $OS. Cannot check dkill dependencies."
        ;;
esac
echo

# Check if forge binary is installed
echo "Checking forge..."
if command -v forge &> /dev/null; then
    FORGE_VERSION=$(forge --version | head -n1 | cut -d' ' -f3)
    print_success "forge is installed (version: $FORGE_VERSION)"
else
    print_error "forge is not installed. Please install Foundry (forge)."
fi
echo

# Check if compact binary is installed
echo "Checking compact..."
if command -v compact &> /dev/null; then
    COMPACT_VERSION=$(compact --version | head -n1 | cut -d' ' -f2)
    print_success "compact is installed (version: $COMPACT_VERSION)"
else
    print_error "compact is not installed. Please install compact."
fi
echo

# Final result
echo "================================================"
if [ $FAILED -eq 0 ]; then
    printf "${GREEN}🎉 All dependency checks passed!${NC}\n"
    exit 0
else
    printf "${RED}💥 Some dependency checks failed. Please install the missing dependencies.${NC}\n"
    exit 1
fi
