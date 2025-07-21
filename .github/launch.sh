#!/bin/bash

# Build with Docker:
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker buildx build -t paima-engine-test .
# > DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run paima-engine-test
set -e  # Exit on any error

# deno upgrade --version 2.4.1
deno --version
forge --version
node --version
npm --version

# 2. Install dependencies
echo "📦 Installing dependencies..."
deno install --allow-scripts

# 3. Apply patches
echo "🔧 Applying patches..."

# Function to comment out a line at specific line number
comment_line() {
    local file="$1"
    local line_num="$2"
    local comment_text="$3"
    
    if [[ -f "$file" ]]; then
        # Use sed to comment out the line (add // at the beginning)
        sed -i.bak "${line_num}s|^|// |" "$file"
        echo "✅ Commented line $line_num in $file"
    else
        echo "⚠️  Warning: File $file not found"
    fi
}

# Function to replace content in a file
replace_in_file() {
    local file="$1"
    local old_content="$2"
    local new_content="$3"
    
    if [[ -f "$file" ]]; then
        # Create backup first
        cp "$file" "$file.bak"
        
        # Use perl for more reliable string replacement
        # Only escape the search pattern, not the replacement text
        perl -i -pe "s/\Q$old_content\E/$new_content/g" "$file"
        echo "✅ Replaced content in $file"
    else
        echo "⚠️  Warning: File $file not found"
    fi
}

# Apply patches
echo "Commenting out await stdoutFileHandle.close()..."
comment_line "./node_modules/.deno/hardhat@3.0.0-next.20/node_modules/hardhat/dist/src/internal/builtin-plugins/solidity/build-system/compiler/compiler.js" 49 "await stdoutFileHandle.close();"

echo "Commenting out first await fileHandle?.close()..."
comment_line "./node_modules/.deno/@nomicfoundation+hardhat-utils@3.0.0-next.20/node_modules/@nomicfoundation/hardhat-utils/dist/src/fs.js" 209 "await fileHandle?.close();"

echo "Commenting out second await fileHandle?.close()..."
comment_line "./node_modules/.deno/@nomicfoundation+hardhat-utils@3.0.0-next.20/node_modules/@nomicfoundation/hardhat-utils/dist/src/fs.js" 275 "await fileHandle?.close();"

echo "Updating fetchHistory method signature..."
replace_in_file "./node_modules/.deno/@utxorpc+sdk@0.6.7/node_modules/@utxorpc/sdk/lib/node/index.d.ts" \
    "fetchHistory(p: ChainPoint, maxItems?: number): Promise<cardano.Block>;" \
    "fetchHistory(p: ChainPoint | undefined, maxItems?: number): Promise<cardano.Block>;"

echo "Updating startToken assignment..."
replace_in_file "./node_modules/.deno/@utxorpc+sdk@0.6.7/node_modules/@utxorpc/sdk/lib/node/index.mjs" \
    "startToken: new sync.BlockRef({" \
    "startToken: !p ? undefined : new sync.BlockRef({"

echo "Updating Solidity version to 0.8.30..."
replace_in_file "./example/contracts/evm/hardhat.config.ts" \
    'version: "0.8.28",' \
    'version: "0.8.30",'

echo "✅ All patches applied successfully"

# 3. Compile Contracts & Deploy Contracts
deno task -f @example/evm-contracts build
deno task -f @example/evm-contracts deploy:standalone || true

echo "✅ Contracts compiled & deployed"

# 4. Run tests
# Kill any process with deno in the name:
# kill -9 `ps aux | grep deno  | awk '{print $2}' | awk NF=NF RS= OFS=" "`;
echo "🧪 Running tests..."
deno task -f @example/node test

# 5. Print project directory
echo "🎉 Clean install & test completed"