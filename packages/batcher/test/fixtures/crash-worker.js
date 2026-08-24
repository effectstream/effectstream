// Dies mid-job without replying.
process.on("message", () => { process.exit(3); });
