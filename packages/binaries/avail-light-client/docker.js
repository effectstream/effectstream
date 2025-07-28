const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

const checkIfDockerExists = async () => {
    try {
        await execPromise('docker --version');
        return true;
    } catch (error) {
        return false;
    }
};

const runDockerContainer = ({ args = [] }) => {
    let finalArgs = [...args];
    let tag = 'availj/avail-light:avail-light-client-v1.13.0-rc11';
    let p2pPort = 37000;
    let httpPort = 7007;
    let volumeMounts = [];

    const extractArgValue = (argName, arr) => {
        const index = arr.indexOf(argName);
        if (index > -1 && index < arr.length - 1) {
            const value = arr[index + 1];
            arr.splice(index, 2);
            return value;
        }
        return undefined;
    };

    const customTag = extractArgValue('--docker-tag', finalArgs);
    if (customTag) tag = customTag;

    const customP2pPort = extractArgValue('--p2p-port', finalArgs);
    if (customP2pPort) p2pPort = customP2pPort;

    const customHttpPort = extractArgValue('--http-port', finalArgs);
    if (customHttpPort) httpPort = customHttpPort;

    const configArgIndex = finalArgs.findIndex(arg => arg === '--config');
    if (configArgIndex === -1) {
        console.error('FATAL: --config flag with a path is required for Docker execution.');
        process.exit(1);
    }

    const hostConfigPath = path.resolve(finalArgs[configArgIndex + 1]);
    const hostWorkDir = path.dirname(hostConfigPath);
    const configFileName = path.basename(hostConfigPath);
    const containerWorkDir = '/data';
    const containerConfigPath = path.join(containerWorkDir, configFileName);

    volumeMounts.push(`-v "${hostWorkDir}:${containerWorkDir}"`);
    finalArgs[configArgIndex + 1] = containerConfigPath;

    const portMappings = `-p ${p2pPort}:37000 -p ${httpPort}:7007`;

    const command = `docker run --rm -it ${volumeMounts.join(' ')} ${portMappings} ${tag} ${finalArgs.join(' ')}`;

    console.log(`Executing Docker command: ${command}`);
    const child = exec(command);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Docker container exited with code ${code}`);
        }
    });
};

module.exports = {
    checkIfDockerExists,
    runDockerContainer,
};

