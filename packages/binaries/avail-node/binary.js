const os = require('os')
const distro = require('linus')
const tar = require('tar')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const FINAL_BINARY_NAME = 'avail-node'

const downloadLinks = {
  'x86_64-ubuntu-2404': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-ubuntu-2404-avail-node.tar.gz',
  'arm64-ubuntu-2204': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/arm64-ubuntu-2204-avail-node.tar.gz',
  'x86_64-ubuntu-2204': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-ubuntu-2204-avail-node.tar.gz',
  'x86_64-ubuntu-2004': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-ubuntu-2004-avail-node.tar.gz',
  'x86_64-fedora-41': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-fedora-41-avail-node.tar.gz',
  'x86_64-arch': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-arch-avail-node.tar.gz',
  'x86_64-debian-12': 'https://github.com/availproject/avail/releases/download/v2.3.0.1-rc1/x86_64-debian-12-avail-node.tar.gz',
  'arm64-macos': 'https://github.com/effectstream/binaries/releases/download/0.3.120/avail-node-macos-arm64-v2.3.0.1.tar.gz',
}

const checkIfSupported = () => {
  const platform = os.platform()
  const isSupported = platform === 'linux' || platform === 'darwin'
  if (!isSupported) {
    console.error('This script is only supported on Linux and macOS.')
    process.exit(1)
  }
  return true
}

const getBinaryKey = () => {
  return new Promise((resolve, reject) => {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'x86_64'
    if (os.platform() === 'darwin') {
      if (arch === 'arm64') {
        return resolve('arm64-macos')
      }
      return reject(new Error('Unsupported macos architecture'))
    }
    distro.name((err, name) => {
      if (err) {
        reject(new Error(`Failed to get distro name: ${err.message}`))
        return
      }

      distro.version((err, version) => {
        if (err) {
          if (name.toLowerCase() === 'arch') {
            return resolve(`${arch}-arch`)
          }
          reject(new Error(`Failed to get distro version: ${err.message}`))
          return
        }

        if (name.toLowerCase() === 'pop') {
          // ubuntu binaries work for popos
          name = 'ubuntu'
        }
        const distroKey = `${arch}-${name.toLowerCase()}-${version.replace('.', '')}`
        resolve(distroKey)
      })
    })
  })
}

const findExtractedBinary = (dir) => {
    const stack = [dir]
    while (stack.length > 0) {
        const currentDir = stack.pop()
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name)
            if (entry.isDirectory()) {
                stack.push(entryPath)
            } else if (
                entry.isFile() &&
                entry.name.startsWith('avail-node') &&
                !entry.name.endsWith('.tar.gz')
            ) {
                return entryPath
            }
        }
    }
    return null
}

const downloadBinary = async (distroKey) => {
    const link = downloadLinks[distroKey]
    if (!link) {
        throw new Error(`Unsupported distro: ${distroKey}`)
    }

    const binDir = path.join(__dirname, 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }
    
    console.log(`Downloading from ${link}...`);
    const response = await fetch(link);
    if (!response.ok) {
        throw new Error(`Failed to download binary: ${response.statusText}`);
    }

    const tarPath = path.join(binDir, 'avail-node.tar.gz');
    const dest = fs.createWriteStream(tarPath);
    for await (const chunk of response.body) {
        dest.write(chunk);
    }
    dest.end();

    return new Promise((resolve, reject) => {
        dest.on('finish', async () => {
            try {
                console.log('Extracting binary...');
                await tar.x({
                    file: tarPath,
                    cwd: binDir,
                    strip: 0, 
                })

                const extractedBinary = findExtractedBinary(binDir)
                if (!extractedBinary) {
                    throw new Error('Failed to locate extracted avail-node binary')
                }

                const finalBinaryPath = path.join(binDir, FINAL_BINARY_NAME)
                if (extractedBinary !== finalBinaryPath) {
                    if (fs.existsSync(finalBinaryPath)) {
                        fs.unlinkSync(finalBinaryPath)
                    }
                    fs.renameSync(extractedBinary, finalBinaryPath)
                }

                fs.chmodSync(finalBinaryPath, 0o755)
                fs.unlinkSync(tarPath); 
                resolve(finalBinaryPath);
            } catch (e) {
                console.log("error", e);
                reject(e);
            }
        });
        dest.on('error', reject);
    });
}

const runBinary = (binaryPath, args = []) => {
    const child = spawn(binaryPath, args, { stdio: 'inherit' });
    child.on('close', (code) => {
        console.log(`Binary process exited with code ${code}`);
    });
}

module.exports = {
    checkIfSupported,
    getBinaryKey,
    downloadBinary,
    runBinary
}

