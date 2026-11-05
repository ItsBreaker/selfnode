// Same Helios check as helios.spike.ts but in Node, to isolate browser issues.
import { createHeliosProvider } from "@a16z/helios";

const network = (process.argv[2] ?? "mainnet") as "mainnet" | "sepolia";
const cfg = {
  mainnet: {
    executionRpc: "https://ethereum-rpc.publicnode.com",
    consensusRpc: process.argv[3] ?? "https://lodestar-mainnet.chainsafe.io",
  },
  sepolia: {
    executionRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    consensusRpc: process.argv[3] ?? "https://lodestar-sepolia.chainsafe.io",
  },
}[network];
const t0 = Date.now();
const p = await createHeliosProvider({ ...cfg, network, dbType: "config" }, "ethereum");
await p.waitSynced();
console.log(network, "synced in", Date.now() - t0, "ms");
for (let i = 0; i < 12; i++) {
  try {
    const bn = await p.request({ method: "eth_blockNumber", params: [] });
    console.log(i, "verified blockNumber", parseInt(bn, 16));
    const bal = await p.request({
      method: "eth_getBalance",
      params: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "latest"],
    });
    console.log("verified getBalance ok", BigInt(bal) > 0n);
    process.exit(0);
  } catch (e) {
    console.log(i, String(e).slice(0, 100));
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
process.exit(1);
