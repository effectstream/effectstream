// Replies after a delay carried in the job, yielding to the event loop.
process.on("message", (job) => {
  setTimeout(() => process.send({ valid: true }), job.nowMs);
});
