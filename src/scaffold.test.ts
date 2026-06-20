import { describe, expect, it } from "vitest";

import { createIncrementalJsxParser } from "./index";
import { createParser } from "./core";
import { useIncrementalJsx } from "./react";

// Phase 0 only ships the public surface; the implementations land in later
// phases. These smoke tests assert that the entry points are wired up and
// currently throw their "not implemented" sentinels.

describe("public entry points", () => {
  it("core exposes createParser", () => {
    expect(createParser).toBeTypeOf("function");
    expect(() => createParser()).toThrow(/not implemented/i);
  });

  it("root exposes createIncrementalJsxParser", () => {
    expect(createIncrementalJsxParser).toBeTypeOf("function");
    expect(() => createIncrementalJsxParser((async function* () {})())).toThrow(/not implemented/i);
  });

  it("react exposes useIncrementalJsx", () => {
    expect(useIncrementalJsx).toBeTypeOf("function");
    expect(() => useIncrementalJsx((async function* () {})())).toThrow(/not implemented/i);
  });
});
