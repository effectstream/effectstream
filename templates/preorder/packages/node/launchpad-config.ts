export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MOCK_USDC_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

// 1 ETH ≈ 8500 ADA — used by the Cardano state machine to convert ETH prices to lovelace
export const ETH_TO_ADA_RATE = 8500n;

type CommonItemProps = {
  id: number;
  name: string;
  description: string;
  image?: string;
  supply?: number;
  purchased?: number;
};

type StandardItem = CommonItemProps & {
  prices: Record<string, string>;
  referralDiscountBps?: number;
};

type FreeRewardItem = CommonItemProps & {
  freeAt: Record<string, string>;
};

type ItemType = StandardItem | FreeRewardItem;

export type LaunchpadData = {
  slug: string;
  address: string;
  cardanoPaymentAddress?: string;
  cardanoPaymentAddressHex?: string;
  name: string;
  description: string;
  image?: string;
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

// NOTE: address is filled at runtime after contract deployment.
// For dev/test, use a placeholder that gets replaced by the deployed proxy address.
export const launchpadsData: LaunchpadData[] = [
  {
    slug: "test-launchpad-1",
    address: "", // filled at runtime from deployed contracts
    cardanoPaymentAddress: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
    cardanoPaymentAddressHex: "009493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e32c728d3861e164cab28cb8f006448139c8f1740ffb8e7aa9e5232dc",
    name: "Test Launchpad 1",
    description: "A demo preorder/launchpad for testing",
    referralDiscountBps: 100,
    referrerRewardBps: 500,
    timestampStartPublicSale: 0,
    timestampEndSale: 9999999999,
    items: [
      // --- Standard items (1-8) ---
      {
        id: 1,
        name: "Iron Helm",
        description: "A sturdy iron helm forged in the mountain furnaces",
        prices: { [ZERO_ADDRESS]: "2000000000000000", [MOCK_USDC_ADDRESS]: "5000000" },
      },
      {
        id: 2,
        name: "Steel Longsword",
        description: "A well-balanced longsword with a razor-sharp edge",
        prices: { [ZERO_ADDRESS]: "5000000000000000", [MOCK_USDC_ADDRESS]: "12000000" },
      },
      {
        id: 3,
        name: "Enchanted Shield",
        description: "A shield imbued with arcane wards that deflect minor spells",
        prices: { [ZERO_ADDRESS]: "10000000000000000", [MOCK_USDC_ADDRESS]: "24000000" },
      },
      {
        id: 4,
        name: "Mithril Chainmail",
        description: "Lightweight yet nearly impenetrable armor woven from mithril threads",
        prices: { [ZERO_ADDRESS]: "20000000000000000", [MOCK_USDC_ADDRESS]: "50000000" },
      },
      {
        id: 5,
        name: "Healing Potion",
        description: "A crimson elixir that mends wounds and restores vitality",
        prices: { [ZERO_ADDRESS]: "1000000000000000", [MOCK_USDC_ADDRESS]: "2000000" },
      },
      {
        id: 6,
        name: "Arcane Spellbook",
        description: "Ancient tome containing forgotten incantations and elemental rituals",
        prices: { [ZERO_ADDRESS]: "9000000000000000", [MOCK_USDC_ADDRESS]: "20000000" },
      },
      {
        id: 7,
        name: "Dragon Scale Armor",
        description: "Armor crafted from the scales of an elder dragon, fireproof and nearly indestructible",
        supply: 10,
        prices: { [ZERO_ADDRESS]: "40000000000000000", [MOCK_USDC_ADDRESS]: "100000000" },
      },
      {
        id: 8,
        name: "Phoenix Staff",
        description: "A legendary staff crowned with an eternal flame that channels resurrection magic",
        supply: 5,
        prices: { [ZERO_ADDRESS]: "200000000000000000", [MOCK_USDC_ADDRESS]: "500000000" },
      },
      // --- Free reward items (101-104) ---
      {
        id: 101,
        name: "Traveler's Cloak",
        description: "A weatherproof cloak that shields against rain and cold",
        freeAt: { [ZERO_ADDRESS]: "3000000000000000", [MOCK_USDC_ADDRESS]: "7000000" },
      },
      {
        id: 102,
        name: "Lucky Amulet",
        description: "A charm said to bring fortune to its wearer in battle",
        freeAt: { [ZERO_ADDRESS]: "17000000000000000", [MOCK_USDC_ADDRESS]: "41000000" },
      },
      {
        id: 103,
        name: "Phoenix Feather",
        description: "A radiant feather that glows with warm light and grants a second chance",
        freeAt: { [ZERO_ADDRESS]: "37000000000000000", [MOCK_USDC_ADDRESS]: "91000000" },
      },
      {
        id: 104,
        name: "Crown of Wisdom",
        description: "An ancient crown that enhances the wearer's intellect and magical affinity",
        freeAt: { [ZERO_ADDRESS]: "87000000000000000", [MOCK_USDC_ADDRESS]: "213000000" },
      },
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
  },
];

export function getLaunchpadByAddress(address: string): LaunchpadData | undefined {
  return launchpadsData.find(
    (l) => l.address.toLowerCase() === address.toLowerCase(),
  );
}

export function getLaunchpadBySlug(slug: string): LaunchpadData | undefined {
  return launchpadsData.find((l) => l.slug === slug);
}

export function setLaunchpadAddress(slug: string, address: string): void {
  const lp = launchpadsData.find((l) => l.slug === slug);
  if (lp) {
    lp.address = address.toLowerCase();
  }
}
