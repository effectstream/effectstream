export const MIDNIGHT_V2_IPC_VERSION = 'effectstream.midnight-v2.provider/1';

const sensitiveKey = /(secret|seed|password|private|proof|witness|credential|token|authorization)/i;

export function validateProviderRequest(value) {
  if (!value || typeof value !== 'object') throw new Error('IPC request must be an object');
  if (value.protocol !== MIDNIGHT_V2_IPC_VERSION) throw new Error('Unsupported IPC protocol');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value.id ?? '')) throw new Error('Invalid IPC request id');
  if (value.method !== 'providers.construct') throw new Error('Unsupported IPC method');
  if (!value.params || typeof value.params !== 'object') throw new Error('IPC params must be an object');
  return value;
}

export function successResponse(id, result) {
  return {
    protocol: MIDNIGHT_V2_IPC_VERSION,
    id,
    ok: true,
    result: redactBoundaryValue(result),
  };
}

export function errorResponse(id, error) {
  return {
    protocol: MIDNIGHT_V2_IPC_VERSION,
    id: /^[a-zA-Z0-9_-]{1,64}$/.test(id ?? '') ? id : 'invalid-request',
    ok: false,
    error: redactError(error),
  };
}

export function redactBoundaryValue(value, key = '') {
  if (sensitiveKey.test(key)) return '<redacted>';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactBoundaryValue(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactBoundaryValue(item, name)]));
  }
  return value;
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return redactString(message).slice(0, 300);
}

function redactString(value) {
  if (!value.includes('://')) return value;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '<redacted>';
  }
}
