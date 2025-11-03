/**
 * Paima might be used in non-browser environments where window isn't defined
 */
export function getWindow(): (Window & typeof globalThis) | undefined {
    // recall: this is different semantically to window?.foo
    // since window?.foo can still give ReferenceError: window is not defined
    return typeof window === 'undefined' ? undefined : window;
}
  