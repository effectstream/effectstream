// Shared constants + types. Campaign/product configuration NO LONGER lives here as a const —
// it is stored in the deterministic `offchain_*` DB tables, written by the state machine in
// response to on-chain EffectstreamL2 admin commands. The `seedCampaignConfig` below is used
// ONLY by the dev/test seed step (start.dev.ts / seed-campaign.ts), which submits it as the
// initial `create-campaign` L2 input. The launchpad address + receiver are injected at runtime.

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MOCK_USDC_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

// 1 ETH ≈ 8500 ADA — used by the Cardano state machine to convert ETH prices to lovelace
export const ETH_TO_ADA_RATE = 8500n;

export type ItemType = {
  id: number;
  name: string;
  description: string;
  image?: string;
  supply?: number;
  kind: "standard" | "reward";
  // Unitless integer price (≈ USD). On-chain amount per coin = price * coin.x * 10^coin.n.
  price: number;
};

export type CampaignConfig = {
  slug: string;
  name: string;
  description: string;
  image?: string;
  // launchpadAddress + receiver are injected by the seed step at runtime (from deploy output).
  launchpadAddress?: string;
  receiver?: string;
  cardanoPaymentAddress?: string;
  cardanoPaymentAddressHex?: string;
  items: ItemType[];
  timestampStartWhitelistSale?: number;
  timestampStartPublicSale: number;
  timestampEndSale: number;
  whitelistedAddresses?: string[];
  referralDiscountBps?: number;
  referrerRewardBps: number;
  curatedPackages?: {
    name: string;
    description?: string;
    items: { id: number; quantity: number }[];
  }[];
};

/**
 * Initial campaign seeded on first boot (ported from the former `launchpadsData[0]`).
 * The seed step fills `launchpadAddress` + `receiver` from the deployed contracts and submits
 * this as a `create-campaign` EffectstreamL2 input signed by the admin wallet.
 */
export const seedCampaignConfig: CampaignConfig = {
  slug: "test-launchpad-1",
  name: "Test Launchpad 1",
  description: "A demo preorder/launchpad for testing",
  cardanoPaymentAddress:
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
  cardanoPaymentAddressHex:
    "009493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e32c728d3861e164cab28cb8f006448139c8f1740ffb8e7aa9e5232dc",
  referralDiscountBps: 100,
  referrerRewardBps: 500,
  timestampStartPublicSale: 0,
  timestampEndSale: 9999999999,
  items: [
    // --- Standard items (1-8) — price is a unitless integer (≈ USD) ---
    { id: 1, name: "Iron Helm", description: "A sturdy iron helm forged in the mountain furnaces", kind: "standard", price: 5 },
    { id: 2, name: "Steel Longsword", description: "A well-balanced longsword with a razor-sharp edge", kind: "standard", price: 12 },
    { id: 3, name: "Enchanted Shield", description: "A shield imbued with arcane wards that deflect minor spells", kind: "standard", price: 24 },
    { id: 4, name: "Mithril Chainmail", description: "Lightweight yet nearly impenetrable armor woven from mithril threads", kind: "standard", price: 50 },
    { id: 5, name: "Healing Potion", description: "A crimson elixir that mends wounds and restores vitality", kind: "standard", price: 2 },
    { id: 6, name: "Arcane Spellbook", description: "Ancient tome containing forgotten incantations and elemental rituals", kind: "standard", price: 20 },
    { id: 7, name: "Dragon Scale Armor", description: "Armor crafted from the scales of an elder dragon, fireproof and nearly indestructible", kind: "standard", price: 100, supply: 10 },
    { id: 8, name: "Phoenix Staff", description: "A legendary staff crowned with an eternal flame that channels resurrection magic", kind: "standard", price: 500, supply: 5 },
    // --- Free reward items (101-104) — price is the unitless spend threshold to unlock ---
    { id: 101, name: "Traveler's Cloak", description: "A weatherproof cloak that shields against rain and cold", kind: "reward", price: 7 },
    { id: 102, name: "Lucky Amulet", description: "A charm said to bring fortune to its wearer in battle", kind: "reward", price: 41 },
    { id: 103, name: "Phoenix Feather", description: "A radiant feather that glows with warm light and grants a second chance", kind: "reward", price: 91 },
    { id: 104, name: "Crown of Wisdom", description: "An ancient crown that enhances the wearer's intellect and magical affinity", kind: "reward", price: 213 },
  ],
  curatedPackages: [
    {
      name: "Adventurer's Kit",
      description: "Basic gear for the aspiring hero: a helm and a healing potion",
      items: [{ id: 1, quantity: 1 }, { id: 5, quantity: 1 }],
    },
    {
      name: "Warrior's Bundle",
      description: "Everything a warrior needs: helm, longsword, and enchanted shield",
      items: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }, { id: 3, quantity: 1 }],
    },
    {
      name: "Knight's Arsenal",
      description: "Full knightly equipment: helm, sword, shield, and mithril chainmail",
      items: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }, { id: 3, quantity: 1 }, { id: 4, quantity: 1 }],
    },
    {
      name: "Archmage Collection",
      description: "The ultimate set: all standard gear plus the legendary dragon scale armor",
      items: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }, { id: 3, quantity: 1 }, { id: 4, quantity: 1 }, { id: 5, quantity: 1 }, { id: 6, quantity: 1 }, { id: 7, quantity: 1 }],
    },
  ],
};
