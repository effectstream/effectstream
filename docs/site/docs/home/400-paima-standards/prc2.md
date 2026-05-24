# PRC-2 - Paima Hololocker Interface

## Use case

Use any L1 ERC-721 NFT inside your game without bridging - locked on-chain, withdrawable on a cooldown.

## Summary

Games are data- and computation-heavy and typically run on sidechains, L2s, or appchains, while popular NFT collections live on a different L1. PRC-2 lets users **project** an NFT they hold on the L1 directly into the game - no bridging, no wrapped tokens, no separate canonical copy. The user keeps unambiguous ownership of the L1 asset and can withdraw it at any time after a time-locked release.

The interface supports projecting one or many NFTs in a single call to save gas.

## Specification

Every PRC-2 compliant contract MUST implement `HololockerInterface`:

```solidity
interface HololockerInterface is IERC721Receiver {
    /// Per-NFT state stored by the locker.
    struct LockInfo {
        uint256 unlockTime;  // Withdrawable timestamp; 0 means unlock not yet requested
        address owner;       // Rightful owner of the NFT
        address operator;    // Account that initiated the lock
    }

    event Lock(address indexed token, address indexed owner, uint256 tokenId, address operator);
    event Unlock(address indexed token, address indexed owner, uint256 tokenId, address operator, uint256 unlockTime);
    event Withdraw(address indexed token, address indexed owner, uint256 tokenId, address operator);
    event LockTimeUpdate(uint256 newValue);

    /// Returns the LockInfo for a `<token, tokenId>` pair.
    function getLockInfo(address token, uint256 tokenId) external view returns (LockInfo memory);

    /// Initiates a lock for one or more NFTs. Stores `{owner, operator: msg.sender, unlockTime: 0}`
    /// for each pair, emits `Lock`, and transfers each NFT to this contract.
    /// Reverts if the two arrays have different lengths.
    function lock(address[] memory tokens, uint256[] memory tokenIds, address owner) external;

    /// Begins the unlock cooldown by setting `unlockTime = block.timestamp + lockTime` and emitting `Unlock`.
    /// Reverts if msg.sender is neither owner nor operator for any pair, or if an unlock is already in progress.
    function requestUnlock(address[] memory tokens, uint256[] memory tokenIds) external;

    /// Withdraws each NFT to its rightful owner, provided `unlockTime` has elapsed.
    /// Reverts if any pair has `unlockTime == 0` (no unlock requested) or `unlockTime > block.timestamp` (cooldown still active).
    function withdraw(address[] memory tokens, uint256[] memory tokenIds) external;

    /// The cooldown added to `block.timestamp` when an unlock is requested.
    function getLockTime() external view returns (uint256);

    /// Governance hook. The new value SHOULD be sanity-bounded; emits `LockTimeUpdate`.
    function setLockTime(uint256 newLockTime) external;
}
```

A Hololocker also implements `IERC721Receiver`, so that NFTs can be locked by calling `IERC721.safeTransferFrom(..., locker, ...)`. When called this way, the implementation MUST initialise the same `LockInfo` it would have created via `lock()` and emit the `Lock` event.

> **Safety note.** Always use `safeTransferFrom` when sending an NFT to the locker. Plain `transferFrom` skips `onERC721Received`, and the locker has no way to record the previous owner - the NFT gets stuck in the contract.

### Standard user flow

```
Lock  →  Request Unlock  →  ⏳ lockTime elapses  →  Withdraw
```

The cooldown (`lockTime`) is what makes simultaneous double-use impossible. It should reflect the L1's finality budget - long enough that the in-game world can rely on a locked NFT being locked when it acts on it.

## Rationale

The Hololocker is essentially an NFT-staking contract with an "Unlocking" state. Earlier proposals (e.g. EIP-4987) did not reach finalisation, so PRC-2 codifies the lightest-weight interface that does the job and is sufficient for in-game use.

### Why "Unlocking" + `lockTime`?

Without a delay between *requesting* an unlock and *receiving* the NFT, the same asset could be used in two places at once - the game holds it, the L1 transfer finishes, and the new owner uses it too. A bounded cooldown forces a single source of truth.

### Consistent contract address

To give users a predictable experience, the Hololocker SHOULD be deployed to the same address on every EVM chain that hosts it. The reference implementation pins `bytes32(uint256(1))` as the salt in its Foundry script, deploying to `0x963ba25745aEE135EdCFC2d992D5A939d42738B6`.

### Why not mint a "receipt NFT" on lock?

A receipt token would help UX - users could see the asset in their wallet - but it nearly doubles `lock`'s gas cost (85 k → 161 k) and increases `withdraw` cost by ~60 % (7.5 k → 12.1 k). PRC-2 deliberately doesn't include one.

### Why ERC-721 only?

Other standards (ERC-20, ERC-1155) can be supported by analogous interfaces with the data model adjusted to amounts rather than ids. PRC-2 stays scoped to ERC-721 to keep the interface small.

## Reference implementation

[`projected-nft-whirlpool/evm/src/Hololocker.sol`](https://github.com/dcSpark/projected-nft-whirlpool/blob/8b0d0367139eb9a43be94edff34a656258e25793/evm/src/Hololocker.sol)

## Security considerations

- The locker MUST be entered via `safeTransferFrom`. `transferFrom` will permanently strand the NFT.
- The `lockTime` setter MUST be access-controlled and SHOULD have an upper-bound check to prevent griefing.
- The cooldown is the only mechanism preventing "use in two places at once" - it MUST be at least the L1's finality window for the deployed chain.

---

## Integration with EffectStream

The Hololocker pattern is what EffectStream's **`CardanoProjectedNFT` primitive** consumes for Cardano-side projections. The same shape applies to EVM-side Hololockers using the on-chain interface specified above.

- **Primitive**: parses Hololocker `State` datums from the indexer stream and materialises a queryable PostgreSQL view of every projected NFT (`Lock`, `Unlocking`, `Claim` states + nullifier tracking). See the [Cardano Primitives reference](/docs/home/chains/cardano#primitives).
- **Runnable template**: [`templates/projected-nft-preorder`](https://github.com/effectstream/effectstream/tree/main/templates/projected-nft-preorder) is a complete devnet + indexer + sync node + React frontend that exercises the full Lock → Unlock → Claim lifecycle.
- **Walkthrough**: the [Projected NFTs blog post](/docs/blog/projected-nfts) walks through the Aiken Cardano contract, the EffectStream primitive, and the dApp end-to-end.

For new EVM Hololocker deployments the [`dcSpark/projected-nft-whirlpool`](https://github.com/dcSpark/projected-nft-whirlpool) repository hosts the reference Solidity contract, the deployment script, and the dApp UI.
