import { AlgorandCrypto } from "./chains/algorand.ts";
import { CardanoCrypto } from "./chains/cardano.ts";
import { EvmCrypto } from "./chains/evm.ts";
import { PolkadotCrypto } from "./chains/polkadot.ts";
import { MinaCrypto } from "./chains/mina.ts";

export class CryptoManager {
  // careful: packages in these classes should be dynamically imported
  // so that we don't have to import a bunch of heavy crypto for games that don't need it

  private static algorand: AlgorandCrypto | undefined;
  private static cardano: CardanoCrypto | undefined;
  private static evm: EvmCrypto | undefined;
  private static polkadot: PolkadotCrypto | undefined;
  private static mina: MinaCrypto | undefined;

  static Algorand(): AlgorandCrypto {
    if (CryptoManager.algorand == null) {
      CryptoManager.algorand = new AlgorandCrypto();
    }
    return CryptoManager.algorand;
  }

  static Cardano(): CardanoCrypto {
    if (CryptoManager.cardano == null) {
      CryptoManager.cardano = new CardanoCrypto();
    }
    return CryptoManager.cardano;
  }

  static Evm(): EvmCrypto {
    if (CryptoManager.evm == null) {
      CryptoManager.evm = new EvmCrypto();
    }
    return CryptoManager.evm;
  }

  static Polkadot(): PolkadotCrypto {
    if (CryptoManager.polkadot == null) {
      CryptoManager.polkadot = new PolkadotCrypto();
    }
    return CryptoManager.polkadot;
  }

  static Mina(): MinaCrypto {
    if (CryptoManager.mina == null) {
      CryptoManager.mina = new MinaCrypto();
    }
    return CryptoManager.mina;
  }
}
