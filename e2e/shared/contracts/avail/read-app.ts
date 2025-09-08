export type AvailApplicationInfo = {
  appId: number;
  txHash: { // The txHash of the apps creation transaction
    value: string;
  };
  ApplicationKey: string;
};

let cachedAppInfo: AvailApplicationInfo | undefined;
export function readAvailApplication(): AvailApplicationInfo {
  if (cachedAppInfo) return cachedAppInfo;
  try {
    // Get the directory of the current module file using Deno's URL API
    const dir = new URL(".", import.meta.url);
    // Construct the full path to avail_app.json
    const appInfoPath = new URL("avail_app.json", dir);
    const appInfoJson = Deno.readTextFileSync(appInfoPath);
    const appInfo = JSON.parse(appInfoJson) as AvailApplicationInfo;
    cachedAppInfo = appInfo;
    return appInfo;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error("avail_app.json not found in the current directory");
    }
    throw new Error(`Failed to read avail_app.json: ${String(err)}`);
  }
}
