import { HttpRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import { isRouteError, TransportUnavailableError } from "./errors.js";

describe("isRouteError: only transport failures blame the route", () => {
  it("transport and RPC failures are route errors", () => {
    expect(isRouteError(new HttpRequestError({ url: "https://rpc.example" }))).toBe(true);
    expect(isRouteError(new TimeoutError({ body: {}, url: "https://rpc.example" }))).toBe(true);
    expect(isRouteError(new TransportUnavailableError("private", "no exits"))).toBe(true);
    const t = Object.assign(new Error("The tunnel exit did not answer"), {
      name: "TunnelOpenTimeoutError",
    });
    expect(isRouteError(t)).toBe(true);
    const f = Object.assign(new Error("Nox didn't answer within 20 s"), {
      name: "FailoverTimeout",
    });
    expect(isRouteError(f)).toBe(true);
  });

  it("code and data errors are not", () => {
    let mix: unknown;
    try {
      // The exact error from the bug report.
      void (({ number: 1n } as unknown as bigint) - 1n);
    } catch (e) {
      mix = e;
    }
    expect(mix).toBeInstanceOf(TypeError);
    expect(isRouteError(mix)).toBe(false);
    expect(isRouteError(new RangeError("Invalid array length"))).toBe(false);
    expect(isRouteError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isRouteError("oops")).toBe(false);
  });
});
