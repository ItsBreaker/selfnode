import { describe, expect, it } from "vitest";
import { parseEther, zeroAddress, type Address } from "viem";
import { assessSend, type SendFacts, type SendRequest } from "./send.js";

// Fixtures: illustrative addresses and balances for unit tests only.
const FROM: Address = "0x1111111111111111111111111111111111111111";
const TO: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const eth = (amount: bigint, to: Address = TO): SendRequest => ({
  chain: "sepolia",
  from: FROM,
  to,
  amount,
  asset: { kind: "native", symbol: "ETH", decimals: 18 },
});
const usdc = (amount: bigint, to: Address = TO): SendRequest => ({
  chain: "sepolia",
  from: FROM,
  to,
  amount,
  asset: { kind: "erc20", address: USDC, symbol: "USDC", decimals: 6 },
});
const facts = (p: Partial<SendFacts> = {}): SendFacts => ({
  nonce: 3,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
  gasEstimate: 21_000n,
  simulation: { ok: true },
  nativeBalance: parseEther("1"),
  tokenBalance: null,
  recipientIsContract: false,
  recipientTxCount: 5,
  recipientLabel: null,
  ...p,
});

describe("assessSend", () => {
  it("builds a clean Sepolia EIP-1559 tx with a 20% gas buffer", () => {
    const { preview, tx } = assessSend(eth(parseEther("0.1")), facts());
    expect(preview.canSend).toBe(true);
    expect(preview.warnings).toEqual([]);
    expect(preview.summary).toBe(
      "Send 0.1 ETH to 0x2222222222222222222222222222222222222222 on Sepolia",
    );
    expect(tx).toMatchObject({
      type: "eip1559",
      chainId: 11155111,
      nonce: 3,
      gas: 25_200n,
      to: TO,
      value: parseEther("0.1"),
    });
  });

  it("decodes token transfers and targets the token contract", () => {
    const { preview, tx } = assessSend(
      usdc(26_000_000n),
      facts({ tokenBalance: 30_000_000n, gasEstimate: 50_000n }),
    );
    expect(preview.call).toMatchObject({
      functionName: "transfer",
      args: { to: TO, amount: "26 USDC" },
    });
    expect(tx?.to).toBe(USDC);
    expect(tx?.value).toBe(0n);
    expect(tx?.data?.slice(0, 10)).toBe("0xa9059cbb");
  });

  it("blocks insufficient balance and failed simulations", () => {
    expect(assessSend(eth(parseEther("2")), facts()).preview.canSend).toBe(false);
    expect(assessSend(usdc(5n), facts({ tokenBalance: 1n })).preview.canSend).toBe(false);
    const failed = assessSend(
      eth(1n),
      facts({ simulation: { ok: false, reason: "execution reverted" }, gasEstimate: null }),
    );
    expect(failed.preview.canSend).toBe(false);
    expect(failed.tx).toBeNull();
  });

  it("requires acknowledgement for the zero address, the token contract and flagged labels", () => {
    expect(
      assessSend(eth(1n, zeroAddress), facts({ recipientTxCount: 0 })).preview.needsAcknowledgement,
    ).toBe(true);
    expect(
      assessSend(usdc(1n, USDC), facts({ tokenBalance: 5n, recipientIsContract: true })).preview
        .needsAcknowledgement,
    ).toBe(true);
    const flagged = assessSend(
      eth(1n),
      facts({
        recipientLabel: { name: "Fake Uniswap", category: "phish-hack", source: "test fixture" },
      }),
    );
    expect(flagged.preview.needsAcknowledgement).toBe(true);
    expect(flagged.preview.warnings[0]?.message).toContain("Fake Uniswap");
  });

  it("notes contract recipients for ETH and brand-new addresses", () => {
    const toContract = assessSend(eth(1n), facts({ recipientIsContract: true }));
    expect(toContract.preview.warnings.map((x) => x.level)).toEqual(["warning"]);
    const fresh = assessSend(eth(1n), facts({ recipientTxCount: 0 }));
    expect(fresh.preview.recipient.isNew).toBe(true);
    expect(fresh.preview.canSend).toBe(true);
  });

  it("refuses mainnet sends before any I/O", async () => {
    const { gatherSendFacts } = await import("./send.js");
    await expect(gatherSendFacts({} as never, { ...eth(1n), chain: "mainnet" })).rejects.toThrow(
      /disabled/,
    );
  });
});
