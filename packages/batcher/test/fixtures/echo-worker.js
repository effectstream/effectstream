// Replies with a verdict derived from the job, after an optional delay.
process.on("message", (job) => {
  const delay = job.nowMs === -1 ? 0 : 0;
  process.send({ valid: job.networkId !== "reject-me", reason: `saw ${job.txBytes.length} bytes` });
});
