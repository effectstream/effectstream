const url = process.argv.at(-1);
if (!url || !url.startsWith("http")) {
  console.error("Usage: bun wait-http.ts <url>");
  process.exit(1);
}

const timeout = Number(process.argv.includes("--timeout")
  ? process.argv[process.argv.indexOf("--timeout") + 1]
  : 60000);

const start = Date.now();

while (Date.now() - start < timeout) {
  try {
    const res = await fetch(url);
    if (res.ok) process.exit(0);
  } catch {
    // not ready yet
  }
  await Bun.sleep(500);
}

console.error(`Timed out waiting for ${url}`);
process.exit(1);
