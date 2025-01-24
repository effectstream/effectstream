#!/bin/bash

mkdir -p ./build

# Include all our contracts in the build
mkdir -p ./build/contracts
cp -r ./src/contracts ./build
rm -rf -r ./build/contracts/dev
# copy over companion ABIs
mkdir -p ./build/companion-abi
cp -r ./src/companions/* ./build/companion-abi

# ABI is generated during the build by hardhat-abi-exporter
mkdir -p ./build/abi
# remove dependencies and test contracts
rm -rf -r ./build/abi/@openzeppelin
rm -rf -r ./build/abi/contracts/dev
# hoist content out of redundant "contracts" folder
mv ./build/abi/src/contracts/* ./build/abi/

# flatten ./MyContract.sol/MyContract.json to just ./MyContract.json
find ./build/abi/ -type d -name '*.sol' -exec sh -c '
    for dir; do
        mv "$dir"/* "$(dirname "$dir")/"
        rmdir "$dir"
    done
' sh {} +

cp ./README.md ./build
cp ./package.json ./build
