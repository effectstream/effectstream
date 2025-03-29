#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
export MAX_RETRIES=3
export RETRY_DELAY=5

# Function to filter console output
filter_console_output() {
    local output="$1"
    echo "$output" | sed \
        -e '/^> src@.*$/d' \
        -e '/^> tsx main\.ts.*$/d' \
        -e '/^$/N;/^\n$/D' \
        -e '/execute \/Users.*$/d' \
        -e '/execute.*tsx$/d'
}

# Function to strip ANSI color codes for logging
strip_ansi_codes() {
    sed -E \
        -e 's/\x1B\[[0-9;]*[mGK]//g' \
        -e 's/\\x1B\[[0-9;]*[mGK]//g'
}

# Initialize report with summary section
init_report() {
    local report_file="$1"
    local test_name="$2"
    echo "Test Report - $(date)" > "$report_file"
    echo "Test Scenario: $test_name" >> "$report_file"
    echo "----------------------------------------" >> "$report_file"
    echo "Test Summary:" >> "$report_file"
    echo "Status: Running" >> "$report_file"
    echo "Steps:" >> "$report_file"
    echo "----------------------------------------" >> "$report_file"
}

# Add to report
add_to_report() {
    local report_file="$1"
    local step="$2"
    local status="$3"
    local console_output="$4"
    local details="$5"
    
    {
        echo "Step: $step"
        echo "Status: $status"
        echo "Console Output:"
        if [ -n "$console_output" ]; then
            echo "$console_output"
        fi
        if [ -n "$details" ]; then
            echo "Details: $details"
        fi
        echo "----------------------------------------"
    } >> "$report_file"
}

update_test_summary() {
    local report_file="$1"
    local overall_status="$2"
    local temp_file=$(mktemp)
    local summary=""
    
    # Read existing report and build summary
    while IFS= read -r line; do
        if [[ $line == "Step: "* ]]; then
            step_name=${line#"Step: "}
            read -r status_line
            status=${status_line#"Status: "}
            summary="$summary\n- $step_name: $status"
        fi
    done < "$report_file"
    
    # Write updated report
    {
        sed -n '1,2p' "$report_file"
        echo "----------------------------------------"
        echo "Test Summary:"
        echo "Status: $overall_status"
        echo -e "Steps:$summary"
        echo "----------------------------------------"
        sed '1,/^----------------------------------------$/d' "$report_file"
    } > "$temp_file"
    
    mv "$temp_file" "$report_file"
}

# Execute step with validation expectation
# execute_step() {
#     local report_file="$1"
#     local cmd="$2"
#     local step_name="$3"
#     local should_validate="$4"
#     local attempt=1
#     local output=""
#     local result=0

execute_step() {
    local report_file="$1"
    local cmd="$2"
    local step_name="$3"
    local should_validate="$4"
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Attempt $attempt of $MAX_RETRIES"
        output=$(eval "$cmd" 2>&1 | grep -v "^> src\|^> tsx")
        # output=$(eval "$cmd" 2>&1)
        result=$?
        
        echo "$output"  # Show output on console

        # Strip ANSI codes for log file
        clean_output=$(echo "$output" | sed 's/\x1B\[[0-9;]*[mGK]//g')
        
        if [ $result -ne 0 ]; then
            if [ $attempt -lt $MAX_RETRIES ]; then
                print_warning "Attempt $attempt failed. Retrying in $RETRY_DELAY seconds..."
                sleep $RETRY_DELAY
                attempt=$((attempt + 1))
                continue
            fi
            add_to_report "$report_file" "$step_name" "FAILED" "$clean_output" "Exit code: $result"
            return $result
        fi
        
        if echo "$clean_output" | grep -q "Validator returned false"; then
            if [ "$should_validate" = "true" ]; then
                add_to_report "$report_file" "$step_name" "FAILED" "$clean_output" "Unexpected validator failure"
                return 1
            fi
            add_to_report "$report_file" "$step_name" "SUCCESS" "$clean_output" "Expected validator rejection"
            return 0
        fi
        
        if echo "$clean_output" | grep -q "TX Settled: true" || echo "$clean_output" | grep -q "Successfully"; then
            if echo "$output" | grep -q "Contract Address:"; then
                echo "$output" | grep "Contract Address:" | cut -d':' -f2 | tr -d '[:space:]' > temp_address
            fi
            
            if [ "$should_validate" = "true" ]; then
                add_to_report "$report_file" "$step_name" "SUCCESS" "$clean_output" "Transaction completed successfully"
                return 0
            fi
            add_to_report "$report_file" "$step_name" "FAILED" "$clean_output" "Expected rejection did not occur"
            return 1
        fi
        
        if echo "$clean_output" | grep -q "ERR_SOCKET_CONNECTION_TIMEOUT\|Connection timed out\|fetch failed\|Transport error"; then
            if [ $attempt -lt $MAX_RETRIES ]; then
                print_warning "Connection error. Retrying in $RETRY_DELAY seconds..."
                sleep $RETRY_DELAY
                attempt=$((attempt + 1))
                continue
            fi
        fi
        
        attempt=$((attempt + 1))
        [ $attempt -le $MAX_RETRIES ] && sleep $RETRY_DELAY
    done
    
    add_to_report "$report_file" "$step_name" "FAILED" "$clean_output" "Max retries exceeded"
    return 1
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_header() {
    echo
    echo -e "${BLUE}----------------------------------------------${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}----------------------------------------------${NC}"
}

setup_cleanup() {
    local report_file="$1"
    trap 'cleanup "$report_file"' EXIT
}

cleanup() {
    local report_file="$1"
    local exit_code=$?
    
    [ -z "$report_file" ] && return 1
    
    if [ -f temp_address ]; then
        rm temp_address
    fi
    
    if [ $exit_code -ne 0 ]; then
        update_test_summary "$report_file" "FAILED"
    else
        update_test_summary "$report_file" "SUCCESS"
    fi
}