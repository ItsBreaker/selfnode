import { describe, expect, it } from "vitest";
import {
  defaultTransportSettings,
  parseTransportSettings,
  serializeTransportSettings,
} from "./settings.js";

describe("transport settings", () => {
  it("defaults to Private mode on Sepolia via an anonymising network", () => {
    expect(parseTransportSettings(undefined)).toEqual(defaultTransportSettings);
    expect(defaultTransportSettings.mode).toBe("private");
  });
  it("never restores the passthrough worker or its opt-in from storage", () => {
    const s = parseTransportSettings({
      anonNetwork: "passthrough",
      allowInsecureReferenceWorker: true,
    });
    expect(s.anonNetwork).toBe(defaultTransportSettings.anonNetwork);
    expect(s.allowInsecureReferenceWorker).toBeUndefined();
    expect(serializeTransportSettings({ ...s, allowInsecureReferenceWorker: true })).not.toContain(
      "allowInsecure",
    );
  });
  it("drops invalid URLs, unknown chains and credentials in URLs", () => {
    const s = parseTransportSettings({
      mode: "mynode",
      myNodeUrl: {
        sepolia: "http://127.0.0.1:8545",
        mainnet: "javascript:alert(1)",
        goerli: "https://x",
      },
      rpcUrl: { sepolia: "https://user:pass@rpc.example" },
    });
    expect(s.mode).toBe("mynode");
    expect(s.myNodeUrl).toEqual({ sepolia: "http://127.0.0.1:8545" });
    expect(s.rpcUrl).toBeUndefined();
  });
  it("round-trips valid settings", () => {
    const s = parseTransportSettings({
      mode: "verified",
      chain: "mainnet",
      anonNetwork: "nym",
      helios: { mainnet: { executionRpc: "https://a.example", consensusRpc: "https://b.example" } },
    });
    expect(parseTransportSettings(JSON.parse(serializeTransportSettings(s)))).toEqual(s);
  });
});
