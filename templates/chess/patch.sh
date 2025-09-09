#!/bin/bash
./../../patch.sh

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

# Function to replace content using a temp file approach for complex strings
replace_complex_content() {
    local file="$1"
    local old_content="$2"
    local new_content="$3"
    
    if [[ -f "$file" ]]; then
        # Create backup first
        cp "$file" "$file.bak"
        
        # Write old and new content to temp files
        local temp_old=$(mktemp)
        local temp_new=$(mktemp)
        printf '%s' "$old_content" > "$temp_old"
        printf '%s' "$new_content" > "$temp_new"
        
        # Use python for reliable string replacement
        python3 -c "
import sys
with open('$file', 'r') as f:
    content = f.read()
with open('$temp_old', 'r') as f:
    old = f.read()
with open('$temp_new', 'r') as f:
    new = f.read()
content = content.replace(old, new)
with open('$file', 'w') as f:
    f.write(content)
"
        
        # Clean up temp files
        rm "$temp_old" "$temp_new"
        echo "✅ Replaced complex content in $file"
    else
        echo "⚠️  Warning: File $file not found"
    fi
}

# Apply patches
echo "Replacing fetch-blob streams.cjs content..."
replace_complex_content "./node_modules/.deno/fetch-blob@3.2.0/node_modules/fetch-blob/streams.cjs" "  // \`node:stream/web\` got introduced in v16.5.0 as experimental
  // and it's preferred over the polyfilled version. So we also
  // suppress the warning that gets emitted by NodeJS for using it.
  try {
    const process = require('node:process')
    const { emitWarning } = process
    try {
      process.emitWarning = () => {}
      Object.assign(globalThis, require('node:stream/web'))
      process.emitWarning = emitWarning
    } catch (error) {
      process.emitWarning = emitWarning
      throw error
    }
  } catch (error) {
    // fallback to polyfill implementation
    Object.assign(globalThis, require('web-streams-polyfill/dist/ponyfill.es2018.js'))
  }" "  Object.assign(globalThis, require('web-streams-polyfill/dist/ponyfill.es2018.js'))"

echo "Replacing fetch-blob from.js imports..."
replace_complex_content "./node_modules/.deno/fetch-blob@3.2.0/node_modules/fetch-blob/from.js" "import { statSync, createReadStream, promises as fs } from 'node:fs'
import { basename } from 'node:path'
import DOMException from 'node-domexception'

import File from './file.js'
import Blob from './index.js'

const { stat } = fs" "import { statSync, createReadStream } from 'node:fs'
import { basename } from 'node:path'
import DOMException from 'node-domexception'

import File from './file.js'
import Blob from './index.js'

import { promises as stat } from 'node:fs'
"

echo "✅ All patches applied successfully"