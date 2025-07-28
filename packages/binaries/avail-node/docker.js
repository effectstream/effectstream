const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)
const path = require('path')
const fs = require('fs')

const DOCKER_IMAGE = 'availj/avail'

const dockerPullCommand = (tag='latest') => `docker pull ${DOCKER_IMAGE}:${tag}`

async function checkIfDockerExists() {
    try {
        await execAsync('docker --version');
        return true;
    } catch (error) {
        return false;
    }
}

const runDockerContainer = (options) => {
  if (!checkIfDockerExists()) {
    console.error('Docker is not installed. Please install Docker and try again.')
    process.exit(1)
  }

  const {
    tag = 'latest',
    p2pPort = 30333,
    rpcPort = 9944,
    args = []
  } = options

  let hostOutputDir = path.join(process.cwd(), 'output')
  const containerOutputDir = '/output'
  const finalArgs = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-d' || arg === '--base-path') {
      if (i + 1 < args.length) {
        hostOutputDir = path.resolve(args[i + 1])
        i++ // skip next arg, it's the path
      }
      continue // Don't add the original -d or --base-path to finalArgs
    }
    if (arg.startsWith('--base-path=')) {
      hostOutputDir = path.resolve(arg.substring('--base-path='.length))
      continue // Don't add the original --base-path to finalArgs
    }
    finalArgs.push(arg)
  }

  if (!fs.existsSync(hostOutputDir)) {
    fs.mkdirSync(hostOutputDir, { recursive: true })
  }

  // Always add the base path for inside the container
  finalArgs.push('-d', containerOutputDir)

  const command = [
    'docker run --rm',
    `-p ${p2pPort}:30333`,
    `-p ${rpcPort}:9944`,
    `-v ${hostOutputDir}:${containerOutputDir}`,
    `${DOCKER_IMAGE}:${tag}`,
    ...finalArgs
  ].join(' ')

  console.log(`Running command: ${command}`)
  const child = exec(command)

  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  child.on('close', (code) => {
    console.log(`Docker container exited with code ${code}`)
  })
}

module.exports = {
    dockerPullCommand,
    runDockerContainer,
    checkIfDockerExists
}

