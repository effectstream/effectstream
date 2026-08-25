const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const IMAGE = 'midnightntwrk/indexer-standalone:4.4.0-rc.1';

/**
 * Checks if Docker is installed and available on the system
 * @returns {Promise<boolean>} True if Docker is available, false otherwise
 */
async function checkIfDockerExists() {
    try {
        await execAsync('docker --version');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Pulls the latest midnight indexer Docker image
 * @returns {Promise<void>}
 */
async function pullDockerImage() {
    console.log(`Pulling Docker image: ${IMAGE}`);
    
    return new Promise((resolve, reject) => {
        const childProcess = spawn('docker', ['pull', IMAGE], {
            stdio: 'inherit'
        });
        
        childProcess.on('exit', (code) => {
            if (code === 0) {
                console.log('Docker image pulled successfully');
                resolve();
            } else {
                reject(new Error(`Docker pull failed with exit code ${code}`));
            }
        });
        
        childProcess.on('error', (error) => {
            reject(new Error(`Failed to pull Docker image: ${error.message}`));
        });
    });
}

/**
 * Runs the midnight indexer Docker container
 * @param {Object} env - Environment variables to pass to the container
 * @param {Array} args - Arguments to pass to the container
 * @returns {ChildProcess} The spawned Docker process
 */
function runDockerContainer(env = process.env, args = []) {
    const containerName = 'midnight-local-indexer';
    
    // Stop and remove existing container if it exists
    try {
        require('child_process').execSync(`docker stop ${containerName} 2>/dev/null || true`, { stdio: 'ignore' });
        require('child_process').execSync(`docker rm ${containerName} 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (error) {
        // Ignore errors - container might not exist
    }
    
    // Build Docker run command arguments
    const dockerArgs = ['run'];
    
    // Add container name (remove existing container if it exists)
    dockerArgs.push('--rm'); // Automatically remove container when it exits
    dockerArgs.push('--name', containerName);
    
    // Intelligent port mapping - default to 8088:8088 if not specified
    const defaultPort = '8088:8088';
    let portMapping = defaultPort;
    
    // Check if port is specified in args
    const portArgIndex = args.findIndex(arg => arg.includes('--port') || arg.includes('-p'));
    if (portArgIndex !== -1 && args[portArgIndex + 1]) {
        const specifiedPort = args[portArgIndex + 1];
        portMapping = `${specifiedPort}:${specifiedPort}`;
        // Remove port args from the args array as they're handled by Docker
        args.splice(portArgIndex, 2);
    }
    
    dockerArgs.push('-p', portMapping);
    
    // Add environment variables
    const requiredEnvVars = [
        'LEDGER_NETWORK_ID',
        'SUBSTRATE_NODE_WS_URL', 
        'APP__INFRA__SECRET',
        'FEATURES_WALLET_ENABLED',
        'APP__INFRA__PROOF_SERVER__URL',
        'APP__INFRA__NODE__URL'
    ];
    
    // Set default values for Docker environment variables (using container network names)
    const envDefaults = {
        'LEDGER_NETWORK_ID': env.LEDGER_NETWORK_ID || 'Undeployed',
        'SUBSTRATE_NODE_WS_URL': env.SUBSTRATE_NODE_WS_URL || 'ws://node:9944',
        'APP__INFRA__SECRET': env.APP__INFRA__SECRET,
        'FEATURES_WALLET_ENABLED': env.FEATURES_WALLET_ENABLED || 'true',
        'APP__INFRA__PROOF_SERVER__URL': env.APP__INFRA__PROOF_SERVER__URL || 'http://proof-server:6300',
        'APP__INFRA__NODE__URL': env.APP__INFRA__NODE__URL || 'ws://node:9944'
    };
    
    // Validate that SECRET is provided
    if (!envDefaults['APP__INFRA__SECRET']) {
        throw new Error('APP__INFRA__SECRET environment variable is required');
    }
    
    // Add environment variables to Docker command
    Object.entries(envDefaults).forEach(([key, value]) => {
        if (value) {
            dockerArgs.push('-e', `${key}=${value}`);
        }
    });
    
    // Add any additional environment variables from env object
    Object.entries(env).forEach(([key, value]) => {
        if (!requiredEnvVars.includes(key) && value) {
            dockerArgs.push('-e', `${key}=${value}`);
        }
    });
    
    // Add the image name
    dockerArgs.push(IMAGE);
    
    // Add any remaining arguments
    if (args.length > 0) {
        dockerArgs.push(...args);
    }
    
    console.log(`Starting Docker container: docker ${dockerArgs.join(' ')}`);
    
    const childProcess = spawn('docker', dockerArgs, {
        stdio: 'inherit'
    });
    
    childProcess.on('spawn', () => {
        console.log(`Docker container started with PID: ${childProcess.pid}`);
        console.log(`Container accessible on port: ${portMapping.split(':')[0]}`);
    });
    
    childProcess.on('error', (error) => {
        console.error('Failed to start Docker container:', error);
    });
    
    childProcess.on('exit', (code, signal) => {
        if (code !== null) {
            console.log(`Docker container exited with code: ${code}`);
        } else {
            console.log(`Docker container terminated by signal: ${signal}`);
        }
    });
    
    return childProcess;
}

module.exports = {
    checkIfDockerExists,
    pullDockerImage,
    runDockerContainer
};
