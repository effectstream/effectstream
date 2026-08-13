// Burns a core synchronously and never replies. Stands in for a wedged WASM
// call: nothing here yields, so only killing the process can stop it.
process.on("message", () => { for (;;) { Math.sqrt(Math.random()); } });
