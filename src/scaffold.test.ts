import { describe, expect, it } from "vitest";

import { createIncrementalJsxParser } from "./index";
import { createParser } from "./core";
import { useIncrementalJsx } from "./react";

// Smoke tests for the public entry points. Behavioral coverage lives in the
// per-module test files; the React hook lands in Phase 6.

describe("public entry points", () => {
  it("core createParser returns a push-based store", () => {
    const parser = createParser();
    expect(parser.write).toBeTypeOf("function");
    expect(parser.end).toBeTypeOf("function");
    expect(parser.getTree).toBeTypeOf("function");
    expect(parser.subscribe).toBeTypeOf("function");
  });

  it("root createIncrementalJsxParser returns a useSyncExternalStore-shaped store", () => {
    const parser = createIncrementalJsxParser((async function* () {})());
    expect(parser.getSnapshot).toBeTypeOf("function");
    expect(parser.getServerSnapshot).toBeTypeOf("function");
    expect(parser.subscribe).toBeTypeOf("function");
    expect(parser.dispose).toBeTypeOf("function");
    expect(parser.done).toBeInstanceOf(Promise);
  });

  it("react exposes useIncrementalJsx", () => {
    expect(useIncrementalJsx).toBeTypeOf("function");
    expect(() => useIncrementalJsx((async function* () {})())).toThrow(/not implemented/i);
  });
});
