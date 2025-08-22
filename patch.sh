#!/bin/bash

# Apply patches
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

echo "✅ All patches applied successfully"