#!/bin/bash

# ------------------------------------------------------------------------------
# Test Case: Payment Default Flow
# ------------------------------------------------------------------------------
# Description: Tests the contract default process where:
# 1. Seller initializes contract with asset and terms
# 2. Buyer accepts contract with initial payment
# 3. Buyer defaults by missing payment deadline
# 4. Seller claims collateral after default period
# ------------------------------------------------------------------------------

# Change to parent directory
cd ..

# Function to display section headers
print_header() {
    echo
    echo "----------------------------------------------"
    echo "$1"
    echo "----------------------------------------------"
}

# Initialize contract and extract address
print_header "Initializing Contract"
pnpm run execute init_contract -p -w user_1 | tee /dev/tty | grep "Contract Address:" | cut -d':' -f2 | tr -d ' \t\n\r' > temp_address
address=$(cat temp_address)
rm temp_address
echo "Contract Address: $address"

# Mint a Root Token
print_header "Minting a Root Token"
pnpm run execute mint_root_token -p -w user_1 --address "$address"


# Creating Account on Contract
print_header "Creating Account on Contract"
pnpm run execute create_account -p -w user_1 --address "$address"

# # Mint a Token
# print_header "Minting a Token"
# pnpm run execute mint -p -w user_1

# # Update Token Metadata
# print_header "Updating Token Metadatum"
# pnpm run execute update -p -w user_1

# print_header "Test Complete"
# echo "Default claim processed successfully"
