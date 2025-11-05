import path from 'node:path';
import { platform, arch } from 'node:os';
import BinWrapper from '@xhmikosr/bin-wrapper';
import { spawn } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';

console.log(`Starting Grafana Alloy on ${platform()} ${arch()}`);

// Get binary name. 
// This is the default name after the binary is downloaded and extracted.
function getBinaryName() {
	const os = arch();
	switch (platform()) {
		case 'win32':
			return (os === 'x64') ? 'alloy-windows-amd64.exe' :
			       undefined;

		case 'darwin':
			return (os === 'arm64') ? 'alloy-darwin-arm64' : 
				   (os === 'x64') ? 'alloy-darwin-amd64' :
				   undefined;
		case 'linux':
			return (os === 'arm64') ? 'alloy-linux-arm64' : 
	               (os === 'x64') ? 'alloy-linux-amd64' :
				   undefined;
	}
	// Throw error if binary name is not found, we don't have the binary for this platform.
	throw new Error(`Unsupported platform: ${platform} - ${os}`);
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
const version = '1.11.3';
const base = `https://github.com/grafana/alloy/releases/download/v${version}/`;

const bin = new BinWrapper()
	.src(`${base}/alloy-darwin-arm64.zip`, 'darwin', 'arm64')
  	.src(`${base}/alloy-darwin-amd64.zip`, 'darwin', 'x64')
	.src(`${base}/alloy-linux-arm64.zip`, 'linux', 'arm64')
	.src(`${base}/alloy-linux-amd64.zip`, 'linux', 'x64')
	.src(`${base}/alloy-windows-amd64.exe.zip`, 'win32', 'x64')
	.dest(path.join(import.meta.dirname, 'vendor'))
	.use(binaryName)
	.version(`>=${version}`)
;


async function runBinary(args = []) {
	// Check if the binary is installed working.
	await bin.run(['--version']);

	const message = `Alloy Web URL: http://localhost:12345`
	// Binary command to launch.
	const command = {
		bin: bin.path(),
		args: [
			'run', path.join(import.meta.dirname, 'alloy-config'), 
			'--storage.path', path.join(import.meta.dirname, 'data'),
			'--stability.level=experimental',
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
	// deno -A @effectstream/grafana-alloy grafana-alloy <optional-args>
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