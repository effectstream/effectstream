/**
 * Inline SVG icons for the three local-JS wallet modes.
 *
 * Each is a 32x32 circle filled with the chain's brand colour and the letters
 * "JS" centered in white, so the wallets-ui (and templates) can distinguish
 * the seed-driven local wallets from injected browser-extension wallets at a
 * glance.
 *
 * Returned as `data:image/svg+xml` data URIs so they slot directly into
 * `WalletOption.icon`, which the UI renders inside `<img>` tags.
 */

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function jsCircle(fill: string, textFill = "#ffffff"): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="16" fill="${fill}"/>` +
    `<text x="16" y="21" text-anchor="middle" ` +
    `font-family="Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" ` +
    `font-weight="700" font-size="13" fill="${textFill}">JS</text>` +
    `</svg>`
  );
}

/** Orange circle — EVM Viem local wallet. */
export const evmViemIcon = encodeSvg(jsCircle("#F97316"));

/** Cardano brand blue circle — Cardano Lucid local wallet. */
export const cardanoLocalIcon = encodeSvg(jsCircle("#0033AD"));

/** Near-black circle — Midnight local-seed wallet. */
export const midnightLocalIcon = encodeSvg(jsCircle("#0A0A0A"));
