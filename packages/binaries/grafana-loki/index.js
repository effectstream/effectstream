import path from 'node:path';
import { platform, arch } from 'node:os';
import BinWrapper from '@xhmikosr/bin-wrapper';
import { spawn } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import { verifyBinaryChecksum } from '@effectstream/binary-checksum';
import { CHECKSUMS } from './checksums.js';

console.log(`Starting Grafana Loki on ${platform()} ${arch()}`);

// Get binary name. 
// This is the default name after the binary is downloaded and extracted.
function getBinaryName() {
	const osArch = arch();
	const osPlatform = platform();
	switch (osPlatform) {
		case 'win32':
			return (osArch === 'x64') ? 'loki-windows-amd64.exe' :
			       undefined;

		case 'darwin':
			return (osArch === 'arm64') ? 'loki-darwin-arm64' : 
				   (osArch === 'x64') ? 'loki-darwin-amd64' :
				   undefined;
		case 'linux':
			return (osArch === 'arm64') ? 'loki-linux-arm64' : 
	               (osArch === 'x64') ? 'loki-linux-amd64' :
				   undefined;
	}
	// Throw error if binary name is not found, we don't have the binary for this platform.
	throw new Error(`Unsupported platform: ${osPlatform} - ${osArch}`);
}

function cleanBinary() {
	console.log(`Cleaning binary folder: ${path.join(import.meta.dirname, 'vendor')}`);
	fs.rmSync(path.join(import.meta.dirname, 'vendor'), { recursive: true, force: true });
}

function cleanData() {
	console.log(`Cleaning data folder: ${path.join(import.meta.dirname, 'data')}`);
	fs.rmSync(path.join(import.meta.dirname, 'data'), { recursive: true, force: true });
}

const binaryName = getBinaryName();

// Download the binary from the GitHub releases page.
const version = '3.5.8';
const base = `https://github.com/grafana/loki/releases/download/v${version}/`;

const bin = new BinWrapper()
	.src(`${base}/loki-darwin-arm64.zip`, 'darwin', 'arm64')
  	.src(`${base}/loki-darwin-amd64.zip`, 'darwin', 'x64')
	.src(`${base}/loki-linux-arm64.zip`, 'linux', 'arm64')
	.src(`${base}/loki-linux-amd64.zip`, 'linux', 'x64')
	.src(`${base}/loki-windows-amd64.exe.zip`, 'win32', 'x64')
	.dest(path.join(import.meta.dirname, 'vendor'))
	.use(binaryName)
	.version(`>=${version}`);


async function runBinary(args = []) {
	// Download and verify BEFORE `bin.run`. `bin.run()` resolves the binary and
	// then executes it (the `.version()` constraint above makes it exec
	// `--version` to check), so calling it first would run an unverified binary
	// and leave the integrity check with nothing left to protect.
	if (!fs.existsSync(bin.path())) {
		await bin.download();
	}
	const flavour = verifyBinaryChecksum({
		binaryPath: bin.path(),
		checksums: CHECKSUMS,
		packageName: 'grafana-loki',
		skipEnvVar: 'GRAFANA_LOKI_SKIP_CHECKSUM',
		version,
	});
	console.log(`[grafana-loki] verified loki v${version} (${flavour})`);

	// Check if the binary is installed working.
	await bin.run(['--version']);

	const message = `Loki URL: http://localhost:3100`
	// Binary command to launch.
	const command = {
		bin: bin.path(),
		args: [
			`-config.file=${path.join(import.meta.dirname, 'loki-config.yaml')}`,
			`-common.path-prefix=${path.join(import.meta.dirname, 'data', 'loki')}`,
			`-common.storage.filesystem.chunk-directory=${path.join(import.meta.dirname, 'data', 'loki', 'chunks')}`,
			`-common.storage.filesystem.rules-directory=${path.join(import.meta.dirname, 'data', 'loki', 'rules')}`,
			...args
		]
	};
	const line = Array(80).fill('=').join('');
	console.log(`${line}\nLaunching command:\n${command.bin} ${command.args.join(' ')}\n\n${message}\n${line}`);
	const child = spawn(command.bin, command.args);

	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		console.log(chunk.toString());
	});

	child.stderr.setEncoding('utf8');
	child.stderr.on('data', (chunk) => {
		console.error(chunk.toString());
	});

	child.on('close', (code) => {
		console.log(`child process exited with code ${code}`);
	});

	return child;
}

// Launch the binary.
// Custom options:
// --no-clean-data to not remove the data storage folder.
// --clean-binary to remove the binary folder.
(async () => {
	// This script is launched with:
	// deno -A @effectstream/grafana-loki grafana-loki <optional-args>
	const optionalArgs = process.argv.slice(3);

	// Clean the data if the flag is not present.
	if (!optionalArgs.includes('--no-clean-data')) cleanData();

	// Clean the binary folder if the flag is present.
	if (optionalArgs.includes('--clean-binary')) cleanBinary();
	
	optionalArgs.indexOf('--no-clean-data') !== -1 && optionalArgs.splice(optionalArgs.indexOf('--no-clean-data'), 1);
	optionalArgs.indexOf('--clean-binary') !== -1 && optionalArgs.splice(optionalArgs.indexOf('--clean-binary'), 1);

	// Run the binary with the remaining optional arguments.
	await runBinary(optionalArgs);
})();

export default runBinary;
