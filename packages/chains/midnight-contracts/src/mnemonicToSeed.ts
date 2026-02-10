import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { Buffer } from "node:buffer";

// Use a BIP39 mnemonic to derive a seed.
// This is compatible with Lace Wallets.
export const mnemonicToSeed = async (mnemonic: string): Promise<Buffer> => {
    const words = mnemonic.trim().split(/\s+/);
    if (!bip39.validateMnemonic(words.join(' '), english)) {
      throw new Error('Invalid mnemonic phrase');
    }
    // Use BIP39 standard seed derivation (PBKDF2)
    // Produces 64 bytes. 
    // hashes it (mixes it up) 2048 times using SHA-512
    const seed = await bip39.mnemonicToSeed(words.join(' '));
    return Buffer.from(seed);
    // As hex string seed: 
    // Buffer.from(await mnemonicToSeed(mnemonic)).toString('hex')
  };