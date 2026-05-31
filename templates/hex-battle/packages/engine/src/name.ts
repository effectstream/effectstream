// Deterministic player-name helper. The original engine shipped a 5781-line
// adjective/noun word list (`name.ts`); for the template we keep the same
// deterministic, wallet-seeded interface but derive a short readable name from
// a hash of the wallet so the engine stays self-contained and tiny. Names are
// purely cosmetic (shown in the UI) and never affect game state / determinism
// beyond being a pure function of the wallet string.
const ADJECTIVES = [
  "Brave",
  "Crimson",
  "Silent",
  "Golden",
  "Iron",
  "Swift",
  "Shadow",
  "Ancient",
  "Frost",
  "Storm",
  "Wild",
  "Noble",
];
const NOUNS = [
  "Hawk",
  "Wolf",
  "Lion",
  "Drake",
  "Falcon",
  "Bear",
  "Raven",
  "Tiger",
  "Viper",
  "Stag",
  "Boar",
  "Fox",
];

export class Name {
  static shortWallet(wallet: string): string {
    const chars = wallet.startsWith("0x") ? 6 : 4;
    return `${wallet.substring(0, chars)}...${wallet.substring(
      wallet.length - 4,
    )}`;
  }

  static generateName(wallet: string): string {
    let hash = 0;
    for (let i = 0; i < wallet.length; i++) {
      const char = wallet.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // keep it a 32-bit int
    }
    const a = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
    const n = NOUNS[Math.abs(hash >> 4) % NOUNS.length];
    return `${a} ${n}`;
  }
}
