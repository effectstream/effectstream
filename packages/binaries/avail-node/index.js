#!/usr/bin/env node
const os = require('os')
const fs = require('fs')
const path = require('path')
const { getBinaryKey, downloadBinary, runBinary, checkIfSupported } = require('./binary')
const { runDockerContainer, checkIfDockerExists } = require('./docker')

const main = async () => {


    const rawArgs = process.argv.slice(2)
    
    const useDockerFlag = rawArgs.includes('--docker')
    if (!useDockerFlag && !checkIfSupported()) {
        console.error('This script is only supported on Linux and macOS.')
        process.exit(1)
    }
    let dockerTag = 'latest'
    let dockerPort = 30333
    let dockerPortRpc = 9944
    const passThroughArgs = []

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i]
        if (arg === '--docker' || arg === '--binary') {
            continue
        }
        if (arg === '--docker-tag') {
            if (i + 1 < rawArgs.length) {
                dockerTag = rawArgs[i + 1]
                i++
            }
            continue
        }
        if (arg.startsWith('--docker-tag=')) {
            dockerTag = arg.substring('--docker-tag='.length)
            continue
        }
        if (arg === '--docker-port') {
            if (i + 1 < rawArgs.length) {
                dockerPort = rawArgs[i + 1]
                i++
            }
            continue
        }
        if (arg.startsWith('--docker-port=')) {
            dockerPort = arg.substring('--docker-port='.length)
            continue
        }
        if (arg === '--docker-port-rpc') {
            if (i + 1 < rawArgs.length) {
                dockerPortRpc = rawArgs[i + 1]
                i++
            }
            continue
        }
        if (arg.startsWith('--docker-port-rpc=')) {
            dockerPortRpc = arg.substring('--docker-port-rpc='.length)
            continue
        }
        passThroughArgs.push(arg)
    }

    if (useDockerFlag) {
        const dockerExists = await checkIfDockerExists()
        if (!dockerExists) {
            console.error('Error: Docker is required but not found.')
            console.error('You specified the --docker flag, so Docker is required.')
            console.error('Please install Docker and ensure the Docker daemon is running.')
            process.exit(1)
        }
    }

    const hasChain = passThroughArgs.some(arg => arg === '--chain' || arg.startsWith('--chain='))
    const hasDev = passThroughArgs.includes('--dev')

    if (!hasChain && !hasDev) {
        console.error('Error: The --chain argument is mandatory.')
        console.error('Please specify a chain (e.g., --chain mainnet) or use the --dev flag for a development environment.')
        process.exit(1)
    }

    if (useDockerFlag) {
        console.log(`Running with Docker (tag: ${dockerTag})...`)
        runDockerContainer({
            tag: dockerTag,
            p2pPort: dockerPort,
            rpcPort: dockerPortRpc,
            args: passThroughArgs
        })
        return
    }

    try {
        console.log('Attempting to use binary...')
        const binaryKey = await getBinaryKey()
        if (!binaryKey) {
            throw new Error('Could not determine binary key for this distribution. Please run with --docker flag.')
        }

        const binaryDir = path.join(__dirname, 'bin')
        const binaryPath = path.join(binaryDir, 'avail-node')

        if (!fs.existsSync(binaryPath)) {
            console.log(`Binary not found for ${binaryKey}, downloading...`)
            await downloadBinary(binaryKey)
        } else {
            console.log('Binary found, skipping download.')
        }

        runBinary(binaryPath, passThroughArgs)
    } catch (error) {
        console.error(`Error: ${error.message}`)
        console.error('Failed to run binary. Please try running with the --docker flag.')
        process.exit(1)
    }
}

main()
