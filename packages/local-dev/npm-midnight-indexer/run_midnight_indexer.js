const { spawn } = require('child_process');
const path = require('path');

/**
 * Executes the midnight-indexer binary as a child process
 * @param {Object} env - Environment variables to pass to the child process
 * @param {Array} args - Optional arguments to pass to the binary
 * @returns {ChildProcess} The spawned child process
 */
function runMidnightIndexer(env = process.env, args = []) {
    const binaryPath = path.join(__dirname, 'indexer-standalone', 'indexer-standalone');
    
    console.log(`Starting midnight-indexer binary at: ${binaryPath}`);
    
    const childProcess = spawn(binaryPath, args, {
        env: env,
        stdio: 'inherit', // Inherit stdin, stdout, stderr from parent process
        cwd: path.join(__dirname, 'indexer-standalone') // Run from inside the midnight-indexer directory
    });
    
    childProcess.on('spawn', () => {
        console.log(`midnight-indexer process spawned with PID: ${childProcess.pid}`);
    });
    
    childProcess.on('error', (error) => {
        console.error('Failed to start midnight-indexer:', error);
    });
    
    childProcess.on('exit', (code, signal) => {
        if (code !== null) {
            console.log(`midnight-indexer process exited with code: ${code}`);
        } else {
            console.log(`midnight-indexer process terminated by signal: ${signal}`);
        }
    });
    
    return childProcess;
}

module.exports = { runMidnightIndexer };
