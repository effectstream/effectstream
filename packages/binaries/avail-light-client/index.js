#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { getBinaryKey, downloadBinary, runBinary, getBinaryPath } = require('./binary');
const { checkIfDockerExists, runDockerContainer } = require('./docker');

const helpMessage = `
NAME:
    avail-light-client - A wrapper for the Avail light client.

DESCRIPTION:
    A user-friendly npm package that manages and runs the Avail light client command-line tool.
    It uses a native binary on supported platforms and seamlessly falls back to a Docker container
    on other operating systems or when explicitly requested.

USAGE:
    avail-light-client [WRAPPER_OPTIONS] -- [EXECUTABLE_OPTIONS]
    npx avail-light-client [WRAPPER_OPTIONS] -- [EXECUTABLE_OPTIONS]

WRAPPER OPTIONS:
    --help, -h          Prints this help message and exits.
    --docker            Forces the use of Docker, even on a natively supported OS.
    --docker-tag <TAG>  Specifies a custom Docker image tag to use.
    --p2p-port <PORT>   Maps a host port to the container's p2p port (37000).
    --http-port <PORT>  Maps a host port to the container's http port (7007).

EXECUTABLE OPTIONS (passed to the avail-light binary/Docker container):
    --config <PATH>     Specifies the location of the configuration file.
                        (Default: The 'config.yml' included with the package)
    --network <NETWORK> Select a network (e.g., local, turing).
    --identity <PATH>   Specifies the location of the identity file.
    --app-id <ID>       The appID for the application client.
    --verbosity <LEVEL> Sets the log level (e.g., info, debug, trace).

    For a full list of executable flags and options, please refer to the official Avail documentation.

CONFIGURATION:
    A 'config.yml' file is included with this package. You can use it as a starting point
    by copying it, modifying it, and then pointing to it with the '--config' option.
`;

const main = async () => {
    let args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(helpMessage);
        process.exit(0);
    }

    const dockerFlagIndex = args.indexOf('--docker');
    let useDocker = false;
    if (dockerFlagIndex !== -1) {
        useDocker = true;
    }

    let configPath;
    const configArgIndex = args.findIndex(arg => arg === '--config');

    if (configArgIndex !== -1 && args[configArgIndex + 1]) {
        configPath = args[configArgIndex + 1];
    } else {
        configPath = path.join(__dirname, 'config.yml');
    }

    const absoluteConfigPath = path.resolve(configPath);

    if (!fs.existsSync(absoluteConfigPath)) {
        console.error(`Error: Configuration file not found at '${absoluteConfigPath}'`);
        process.exit(1);
    }
    
    if (configArgIndex !== -1) {
        args[configArgIndex + 1] = absoluteConfigPath;
    } else {
        const dockerArgs = useDocker ? args.filter(arg => !arg.startsWith('--')) : [];
        args.push('--config', absoluteConfigPath, ...dockerArgs);
    }
    

    let isNativeSupported = true;
    try {
        getBinaryKey();
    } catch (e) {
        isNativeSupported = false;
    }

    const willUseDocker = useDocker || !isNativeSupported;

    if (willUseDocker) {
        console.log('Attempting to run with Docker...');
        const dockerExists = await checkIfDockerExists();
        if (!dockerExists) {
            let errorMessage = 'Docker is not installed or the Docker daemon is not running. Please install Docker and try again.';
            if (!isNativeSupported) {
                errorMessage = `Your OS is not supported for native binaries, and Docker is not available to use as a fallback. Please install Docker.`;
            } else if (useDocker) {
                errorMessage = `You passed the --docker flag, but Docker is not available. Please install Docker or run without the --docker flag.`;
            }
            console.error(errorMessage);
            process.exit(1);
        }
        runDockerContainer({ args });
    } else {
        const binaryPath = getBinaryPath();
        try {
            if (!fs.existsSync(binaryPath)) {
                console.log('Binary not found, downloading...');
                await downloadBinary();
            }
            const finalArgs = args.filter(arg => arg !== '--docker');
            runBinary(finalArgs);
        } catch (error) {
            console.error('Failed to run native binary:', error.message);
            console.log('Attempting to fall back to Docker...');
            const dockerExists = await checkIfDockerExists();
            if (!dockerExists) {
                console.error('Failed to run native binary and Docker is not available to use as a fallback. Please install Docker.');
                process.exit(1);
            }
            runDockerContainer({ args });
        }
    }
};

main().catch(error => {
    console.error(`An unexpected error occurred: ${error.message}`);
    process.exit(1);
});
