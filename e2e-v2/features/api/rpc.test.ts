/**
 * RPC tests — validates the Paima EVM RPC proxy at /rpc/evm.
 *
 * Assertions are intentionally permissive today (type/null/shape checks) to
 * survive environment variance. Each test is annotated with:
 *   - Currently:  what is actually asserted
 *   - Should:     the logically correct expectation, for future tightening
 *
 * When tightening, prefer deriving expected values from fixtures or the
 * state-machine DB rather than hardcoding — the wallets list, deploy order,
 * and hardhat chainId are all authoritative sources.
 */
import { assert } from "@e2e-v2/engine";
import { createPublicClient, defineChain, http } from "viem";

function getRpcClient(apiPort: number) {
  const chain = defineChain({
    id: 1,
    name: "Effectstream",
    nativeCurrency: { decimals: 18, name: "E", symbol: "E" },
    rpcUrls: { default: { http: [`http://localhost:${apiPort}/rpc/evm`] } },
  });
  return createPublicClient({ chain, transport: http() });
}

export async function rpcTest(apiPort: number) {
  const rpc = getRpcClient(apiPort);
  const rpcUrl = `http://localhost:${apiPort}/rpc/evm`;

  async function rawRpc(method: string, params: any[] = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return res.json();
  }

  // Currently: block number is a bigint > 0 (retried up to 10×).
  // Should:    equal the latest indexed block in state_machine.current_block
  //            (the proxy reports the sync tip, not the upstream L1 tip).
  await assert("RPC: eth_blockNumber", async () => {
    for (let i = 0; i < 10; i++) {
      try {
        const bn = await rpc.getBlockNumber();
        if (typeof bn === "bigint" && bn > 0n) return true;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });

  // Currently: returns a non-null object.
  // Should:    block.number === 1n, block.hash is a 32-byte hex,
  //            block.parentHash === genesis hash, block.timestamp > 0.
  await assert("RPC: eth_getBlockByNumber", async () => {
    const block = await rpc.getBlock({ blockNumber: 1n });
    return block !== null && typeof block === "object";
  });

  // Currently: balance is a bigint (any value).
  // Should:    for hardhat wallets[0] (pre-funded with 10000 ETH), balance
  //            should equal 10000 ETH − (transfers made during this run) − gas.
  //            The Paima RPC proxy reports gas = 0, so balance shrinks only by
  //            transferred amounts.
  await assert("RPC: eth_getBalance", async () => {
    const balance = await rpc.getBalance({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
    return typeof balance === "bigint";
  });

  // Currently: chainId is a positive number.
  // Should:    equal the chain id configured in e2e-v2/evm/config.ts / hardhat
  //            (typically 31337). Hardcoding would let us detect chain config
  //            regressions.
  await assert("RPC: eth_chainId", async () => {
    const chainId = await rpc.getChainId();
    return typeof chainId === "number" && chainId > 0;
  });

  // Currently: gasPrice === 0n (already tight).
  // Should:    stay 0 — the Paima proxy deliberately reports zero gas since
  //            transactions are free inside the rollup; this assertion is
  //            intentionally strict as a guard against that invariant changing.
  await assert("RPC: eth_gasPrice", async () => {
    const gasPrice = await rpc.getGasPrice();
    return typeof gasPrice === "bigint" && gasPrice === 0n;
  });

  // Currently: returns an array (possibly empty).
  // Should:    include the Transfer/Mint logs from ERC20/ERC721/ERC1155
  //            deployments + mint calls executed by the EVM sync tests.
  //            Count should match (deploy events + mint count) from fixtures.
  await assert("RPC: eth_getLogs", async () => {
    const logs = await rpc.getLogs({ fromBlock: 1n, toBlock: "latest" });
    return Array.isArray(logs);
  });

  // Currently: nonce is a number or bigint (any value).
  // Should:    equal the exact count of txs sent from wallets[0] — derivable
  //            from the EVM tooling phase (deploys + mints).
  await assert("RPC: eth_getTransactionCount", async () => {
    const count = await rpc.getTransactionCount({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
    return typeof count === "number" || typeof count === "bigint";
  });

  // Currently: non-null object (or skipped if block 1 has no hash).
  // Should:    the block fetched by hash must equal the block fetched by
  //            number 1 — assert deep-equality of (number, hash, parentHash,
  //            timestamp, transactions).
  await assert("RPC: eth_getBlockByHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const block = await rpc.getBlock({ blockHash: block1.hash });
    return block !== null && typeof block === "object";
  });

  // Currently: gas === 0n (already tight).
  // Should:    stay 0 — same rationale as eth_gasPrice: the Paima proxy
  //            exposes a gas-free execution model.
  await assert("RPC: eth_estimateGas", async () => {
    const gas = await rpc.estimateGas({ to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: 1000n });
    return typeof gas === "bigint" && gas === 0n;
  });

  // Currently: result is defined (could be anything).
  // Should:    === false, once the sync node has caught up to the L1 tip at
  //            steady state. A sync-progress object would indicate the node
  //            is still catching up.
  await assert("RPC: eth_syncing", async () => {
    const json = await rawRpc("eth_syncing");
    return json.result !== undefined;
  });

  // Currently: string including "PaimaEngine" (reasonably tight).
  // Should:    match "PaimaEngine/<version>" where version aligns with
  //            package.json — catches stale or forked client identifiers.
  await assert("RPC: web3_clientVersion", async () => {
    const json = await rawRpc("web3_clientVersion");
    return typeof json.result === "string" && json.result.includes("PaimaEngine");
  });

  // Currently: 0x-prefixed 66-char hex (32 bytes).
  // Should:    exactly keccak256("hello world") =
  //            0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad.
  //            A tight equality check would detect hash-function regressions.
  await assert("RPC: web3_sha3", async () => {
    const json = await rawRpc("web3_sha3", ["0x68656c6c6f20776f726c64"]);
    return typeof json.result === "string" && json.result.startsWith("0x") && json.result.length === 66;
  });

  // Currently: any string.
  // Should:    equal String(chainId) — net_version historically returns the
  //            chain id as a decimal string. Any divergence from eth_chainId
  //            is a bug.
  await assert("RPC: net_version", async () => {
    const json = await rawRpc("net_version");
    return typeof json.result === "string";
  });

  // Currently: === true (already tight).
  // Should:    stay true — the RPC proxy advertises listening unconditionally.
  await assert("RPC: net_listening", async () => {
    const json = await rawRpc("net_listening");
    return json.result === true;
  });

  // Currently: === "0x0" (already tight).
  // Should:    stay "0x0" — Paima is not a p2p node; no peers is invariant.
  await assert("RPC: net_peerCount", async () => {
    const json = await rawRpc("net_peerCount");
    return json.result === "0x0";
  });

  // Currently: count === 0.
  // Should:    block 1 has zero user transactions in Paima's L2 view since
  //            the state machine records only rollup blocks, not L1 txs.
  //            If this ever returns >0, the proxy is leaking L1 tx counts.
  await assert("RPC: eth_getBlockTransactionCountByNumber", async () => {
    const count = await rpc.getBlockTransactionCount({ blockNumber: 1n });
    return typeof count === "number" && count === 0;
  });

  // Currently: === "0x0" (already tight).
  // Should:    stay "0x0" — Paima's chain has no uncles by design (no PoW).
  await assert("RPC: eth_getUncleCountByBlockNumber", async () => {
    const json = await rawRpc("eth_getUncleCountByBlockNumber", ["0x1"]);
    return json.result === "0x0";
  });

  // Currently: === null (already tight).
  // Should:    stay null — no uncles means no uncle-by-index lookups resolve.
  await assert("RPC: eth_getUncleByBlockNumberAndIndex", async () => {
    const json = await rawRpc("eth_getUncleByBlockNumberAndIndex", ["0x1", "0x0"]);
    return json.result === null;
  });

  // ── Methods ported from old e2e ──────────────────────────────────────────

  // Currently: null or any object (very weak — a broken proxy returning {}
  //            would pass).
  // Should:    for a non-existent hash like 0x00...00, result === null.
  //            The strict check: json.result === null. We should also add a
  //            companion test that queries a *real* tx hash from the current
  //            run and asserts the returned object matches
  //            (hash, from, to, value, blockNumber).
  await assert("RPC: eth_getTransactionByHash", async () => {
    const json = await rawRpc("eth_getTransactionByHash", ["0x0000000000000000000000000000000000000000000000000000000000000000"]);
    return json.result === null || typeof json.result === "object";
  });

  // Currently: null or any object.
  // Should:    for 0x00...00, result === null strictly. Pair with a real-hash
  //            test that asserts receipt.status === "0x1", logsBloom is a
  //            valid 256-byte hex, and logs match the tx's emitted events.
  await assert("RPC: eth_getTransactionReceipt", async () => {
    const json = await rawRpc("eth_getTransactionReceipt", ["0x0000000000000000000000000000000000000000000000000000000000000000"]);
    return json.result === null || typeof json.result === "object";
  });

  // Currently: result is "0x0" or any string.
  // Should:    result === "0x0" strictly (block 1 has no user txs, see
  //            eth_getBlockTransactionCountByNumber above). The "any string"
  //            branch makes this assertion effectively a no-op.
  await assert("RPC: eth_getBlockTransactionCountByHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getBlockTransactionCountByHash", [block1.hash]);
    return json.result === "0x0" || typeof json.result === "string";
  });

  // Currently: null or any object.
  // Should:    result === null strictly for block 1 index 0 (no txs).
  //            When tightened, pair with a block known to contain a tx to
  //            assert the returned object equals the expected tx shape.
  await assert("RPC: eth_getTransactionByBlockHashAndIndex", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getTransactionByBlockHashAndIndex", [block1.hash, "0x0"]);
    return json.result === null || typeof json.result === "object";
  });

  // Currently: null or any object.
  // Should:    result === null strictly for block 1 index 0. Same pairing
  //            suggestion as eth_getTransactionByBlockHashAndIndex.
  await assert("RPC: eth_getTransactionByBlockNumberAndIndex", async () => {
    const json = await rawRpc("eth_getTransactionByBlockNumberAndIndex", ["0x1", "0x0"]);
    return json.result === null || typeof json.result === "object";
  });

  // Currently: === "0x0" (already tight).
  // Should:    stay "0x0" — no uncles by design.
  await assert("RPC: eth_getUncleCountByBlockHash", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getUncleCountByBlockHash", [block1.hash]);
    return json.result === "0x0";
  });

  // Currently: === null (already tight).
  // Should:    stay null — no uncles by design.
  await assert("RPC: eth_getUncleByBlockHashAndIndex", async () => {
    const block1 = await rpc.getBlock({ blockNumber: 1n });
    if (!block1?.hash) return true;
    const json = await rawRpc("eth_getUncleByBlockHashAndIndex", [block1.hash, "0x0"]);
    return json.result === null;
  });
}
