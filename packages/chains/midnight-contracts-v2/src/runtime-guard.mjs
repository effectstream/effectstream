const laneSymbol = Symbol.for('@effectstream/midnight-runtime-lane');

export function assertNode22(version = process.versions.node) {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(`Midnight v2 requires Node >=22; received ${safeVersion(version)}`);
  }
}

export function claimRuntimeLane(lane) {
  if (lane !== 'ledger-v9/runtime-v4') throw new Error('Unsupported Midnight runtime lane');
  const current = globalThis[laneSymbol];
  if (current !== undefined && current !== lane) {
    throw new Error(`Midnight runtime collision: ${current} cannot share a process with ${lane}`);
  }
  globalThis[laneSymbol] = lane;
  return lane;
}

export function assertSinglePhysicalCopy(packageName, packageRoots) {
  const unique = new Set(packageRoots.map((root) => String(root)));
  if (unique.size !== 1) {
    throw new Error(`${packageName} resolved to ${unique.size} physical copies`);
  }
  return unique.values().next().value;
}

function safeVersion(value) {
  return /^\d+(?:\.\d+){0,3}$/.test(value) ? value : '<redacted>';
}
