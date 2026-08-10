import { createInterface } from 'node:readline';

import { constructV2Providers, PROVIDER_KINDS } from './providers.mjs';
import { errorResponse, successResponse, validateProviderRequest } from './ipc.mjs';

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  let request;
  try {
    request = validateProviderRequest(JSON.parse(line));
    const providers = constructV2Providers(request.params, fakeFactories());
    process.stdout.write(`${JSON.stringify(successResponse(request.id, {
      runtime: process.release.name,
      providerKinds: Object.keys(providers),
      endpoint: request.params.nodeUrl,
    }))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorResponse(request?.id, error))}\n`);
  }
}

function fakeFactories() {
  return Object.fromEntries(PROVIDER_KINDS.map((kind) => [kind, () => Object.freeze({ kind })]));
}
