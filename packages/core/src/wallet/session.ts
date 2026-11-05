/**
 * An unlocked wallet. Holds the private key as bytes so lock() can zero them.
 * (JS strings can't be wiped; the signer converts to hex only for the duration
 * of a single signature. This is the practical limit in a browser.)
 */
import type { Address } from "viem";

export class LockedError extends Error {
  override readonly name = "LockedError";
  constructor() {
    super("The wallet is locked");
  }
}

export class WalletSession {
  #key: Uint8Array | null;
  constructor(
    key: Uint8Array,
    readonly address: Address,
  ) {
    this.#key = key;
  }

  get unlocked(): boolean {
    return this.#key !== null;
  }

  /** Run `fn` with the key. Only the signer module should call this. */
  withKey<T>(fn: (key: Uint8Array) => T): T {
    if (!this.#key) throw new LockedError();
    return fn(this.#key);
  }

  lock(): void {
    this.#key?.fill(0);
    this.#key = null;
  }
}
