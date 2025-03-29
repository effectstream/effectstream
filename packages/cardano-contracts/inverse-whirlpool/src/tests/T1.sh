#!/bin/bash

# ------------------------------------------------------------------------------
# Test Case: 1
# ------------------------------------------------------------------------------
# Description: Tests the contract default process where:
# 1. User initiates
# ------------------------------------------------------------------------------

# Include test utilities
source utils/test_utils.sh

# Exit on error
set -e

# Change to parent directory
cd ..

# Create reports directory if it doesn't exist
mkdir -p tests/reports

# Set report file name
REPORT_FILE="tests/reports/T1_$(date +%Y-%m-%d_%H%M%S).txt"

# Parse command line options
while getopts "o:" opt; do
  case $opt in
    o)
      REPORT_FILE="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      echo "Usage: $0 [-o report_file]" >&2
      exit 1
      ;;
  esac
done

# Initialize report and setup cleanup
init_report "$REPORT_FILE" "T1 - Base Case"
setup_cleanup "$REPORT_FILE"

# Initialize contract and Mint a Root Token
print_header "Initializing Contract - Minting a Root Token"
output=$(execute_step "$REPORT_FILE" 'pnpm run execute init_contract -p -w user_1' "Contract Initialization" "true")
printf "%s\n" "$output"
address=$(echo "$output" | grep "Contract Address" | sed 's/.*: //; s/\x1B\[[0-9;]*[mGK]//g' | xargs)
[ -z "$address" ] && { echo "Error: Failed to extract contract address"; exit 1; }
echo "$address" > temp_address

address=$(cat temp_address)

# Creating Account on Contract
print_header "Creating Account on Contract"
execute_step "$REPORT_FILE" "pnpm run execute create_account -p --address \"$address\" -w user_1" "Create Account" "true"

pnpm run execute create_account -p -w user_1 --address "$address"

# # Mint a Token
# print_header "Minting a Token"
# pnpm run execute mint -p -w user_1 -d tests/data/T1-metadatum-A.json

# # Update Token Metadata
# print_header "Updating Token Metadatum"
# pnpm run execute update -p -w user_1 -d tests/data/T1-metadatum-B.json

# print_header "Test Complete"
# echo "Default claim processed successfully"
