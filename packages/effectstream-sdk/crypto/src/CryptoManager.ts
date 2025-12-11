import { AlgorandCrypto } from "./chains/algorand.ts";
import { CardanoCrypto } from "./chains/cardano.ts";
import { EvmCrypto } from "./chains/evm.ts";
import { PolkadotCrypto } from "./chains/polkadot.ts";
import { MinaCrypto } from "./chains/mina.ts";
import { MidnightCrypto } from "./chains/midnight.ts";
import { AddressType } from "@effectstream/utils";
import { IVerify } from "./IVerify.ts";

export class CryptoManager {
  // TODO:
  // careful: packages in these classes should be dynamically imported
  // so that we don't have to import a bunch of heavy crypto libraries that don't need it

  private static algorand: AlgorandCrypto | undefined;
  private static cardano: CardanoCrypto | undefined;
  private static evm: EvmCrypto | undefined;
  private static polkadot: PolkadotCrypto | undefined;
  private static mina: MinaCrypto | undefined;
  private static midnight: MidnightCrypto | undefined;
  
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

  static Midnight(): MidnightCrypto {
    if (CryptoManager.midnight == null) {
      CryptoManager.midnight = new MidnightCrypto();
    }
    return CryptoManager.midnight;
  }

  public static getCryptoManager(addressType: AddressType): IVerify {
    switch (addressType) {
      case AddressType.EVM:
        return CryptoManager.Evm();
      case AddressType.CARDANO:
        return CryptoManager.Cardano();
      case AddressType.POLKADOT:
        return CryptoManager.Polkadot();
      case AddressType.ALGORAND:
        return CryptoManager.Algorand();
      case AddressType.MINA:
        return CryptoManager.Mina();
      case AddressType.MIDNIGHT:
        return CryptoManager.Midnight();
      default:
        throw new Error(`Unsupported address type: ${addressType}`);
    }
  }
}

