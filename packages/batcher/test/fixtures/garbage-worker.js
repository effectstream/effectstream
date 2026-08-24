// Replies with something that is not a verdict.
process.on("message", () => { process.send({ nonsense: true }); });
