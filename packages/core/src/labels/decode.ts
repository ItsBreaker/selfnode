/**
 * Decode calldata with candidate signatures (e.g. from the Arkiv mirror).
 * 4-byte selectors collide, so each candidate is tried and only one that
 * actually decodes the calldata cleanly is used.
 */
import { decodeFunctionData, parseAbiItem, type AbiFunction, type Hex } from "viem";

export interface DecodedCall {
  signature: string;
  functionName: string;
  args: { name: string; type: string; value: unknown }[];
}

export function decodeWithCandidates(data: Hex, candidates: string[]): DecodedCall | null {
  for (const text of candidates) {
    try {
      const item = parseAbiItem(`function ${text}`) as AbiFunction;
      const { functionName, args } = decodeFunctionData({ abi: [item], data });
      return {
        signature: text,
        functionName,
        args: item.inputs.map((inp, i) => ({
          name: inp.name || `arg${i}`,
          type: inp.type,
          value: (args ?? [])[i],
        })),
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
