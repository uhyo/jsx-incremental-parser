import { describe, expect, it } from "vitest";

import { Tokenizer, type Partial, type Token } from "./tokenizer";

/** Tokenize `input` split into chunks of the given sizes, collecting all tokens. */
function tokenize(input: string, chunkSizes?: number[]): Token[] {
  const tk = new Tokenizer();
  const tokens: Token[] = [];
  if (chunkSizes) {
    let offset = 0;
    for (const size of chunkSizes) {
      tokens.push(...tk.write(input.slice(offset, offset + size)));
      offset += size;
    }
    tokens.push(...tk.write(input.slice(offset)));
  } else {
    tokens.push(...tk.write(input));
  }
  tokens.push(...tk.end());
  return tokens;
}

/** Split `input` into chunks of exactly `size` characters. */
function fixedChunks(input: string, size: number): number[] {
  const sizes: number[] = [];
  for (let i = 0; i < input.length; i += size) sizes.push(size);
  return sizes;
}

describe("Tokenizer — emission", () => {
  it("tokenizes a simple element with text", () => {
    expect(tokenize("<div>Hello</div>")).toEqual<Token[]>([
      { type: "openTagStart", name: "div" },
      { type: "openTagEnd" },
      { type: "text", value: "Hello" },
      { type: "closeTag", name: "div" },
    ]);
  });

  it("tokenizes nested elements", () => {
    expect(tokenize("<div><span>hi</span></div>")).toEqual<Token[]>([
      { type: "openTagStart", name: "div" },
      { type: "openTagEnd" },
      { type: "openTagStart", name: "span" },
      { type: "openTagEnd" },
      { type: "text", value: "hi" },
      { type: "closeTag", name: "span" },
      { type: "closeTag", name: "div" },
    ]);
  });

  it("tokenizes self-closing elements", () => {
    expect(tokenize("<br />")).toEqual<Token[]>([
      { type: "openTagStart", name: "br" },
      { type: "selfClose" },
    ]);
    expect(tokenize("<br/>")).toEqual<Token[]>([
      { type: "openTagStart", name: "br" },
      { type: "selfClose" },
    ]);
  });

  it("tokenizes fragments", () => {
    expect(tokenize("<>x</>")).toEqual<Token[]>([
      { type: "openTagStart", name: "" },
      { type: "openTagEnd" },
      { type: "text", value: "x" },
      { type: "closeTag", name: "" },
    ]);
  });

  it("tokenizes string attributes (both quote styles)", () => {
    expect(tokenize(`<a href="x" title='y'>`)).toEqual<Token[]>([
      { type: "openTagStart", name: "a" },
      { type: "attribute", name: "href", value: { type: "string", value: "x" } },
      { type: "attribute", name: "title", value: { type: "string", value: "y" } },
      { type: "openTagEnd" },
    ]);
  });

  it("tokenizes boolean shorthand attributes", () => {
    expect(tokenize(`<input disabled required>`)).toEqual<Token[]>([
      { type: "openTagStart", name: "input" },
      { type: "attribute", name: "disabled", value: { type: "boolean" } },
      { type: "attribute", name: "required", value: { type: "boolean" } },
      { type: "openTagEnd" },
    ]);
  });

  it("handles a boolean attr immediately before self-close", () => {
    expect(tokenize(`<hr noshade/>`)).toEqual<Token[]>([
      { type: "openTagStart", name: "hr" },
      { type: "attribute", name: "noshade", value: { type: "boolean" } },
      { type: "selfClose" },
    ]);
  });

  it("mixes boolean and valued attributes", () => {
    expect(tokenize(`<input type="text" disabled value="x">`)).toEqual<Token[]>([
      { type: "openTagStart", name: "input" },
      { type: "attribute", name: "type", value: { type: "string", value: "text" } },
      { type: "attribute", name: "disabled", value: { type: "boolean" } },
      { type: "attribute", name: "value", value: { type: "string", value: "x" } },
      { type: "openTagEnd" },
    ]);
  });

  it("keeps quotes-internal characters verbatim", () => {
    expect(tokenize(`<a t="a<b>{c}">`)).toEqual<Token[]>([
      { type: "openTagStart", name: "a" },
      { type: "attribute", name: "t", value: { type: "string", value: "a<b>{c}" } },
      { type: "openTagEnd" },
    ]);
  });

  it("flushes trailing text on end()", () => {
    expect(tokenize("hello")).toEqual<Token[]>([{ type: "text", value: "hello" }]);
  });

  it("tokenizes capitalized component names", () => {
    expect(tokenize("<Card></Card>")).toEqual<Token[]>([
      { type: "openTagStart", name: "Card" },
      { type: "openTagEnd" },
      { type: "closeTag", name: "Card" },
    ]);
  });

  it("allows hyphen and dot in names", () => {
    expect(tokenize("<my-el></my-el>")).toEqual<Token[]>([
      { type: "openTagStart", name: "my-el" },
      { type: "openTagEnd" },
      { type: "closeTag", name: "my-el" },
    ]);
  });
});

function pendingAfter(input: string): Partial {
  const tk = new Tokenizer();
  tk.write(input);
  return tk.getPending();
}

describe("Tokenizer — getPending (frontier)", () => {
  it("reports no pending in an idle/complete state", () => {
    expect(pendingAfter("<div>")).toEqual<Partial>({ type: "none" });
  });

  it("reports partial text", () => {
    expect(pendingAfter("<div>Hello")).toEqual<Partial>({ type: "text", value: "Hello" });
  });

  it("reports no pending mid-tag (partial open tag is hidden)", () => {
    expect(pendingAfter("<div><sp")).toEqual<Partial>({ type: "none" });
  });

  it("reports no pending mid-attribute", () => {
    expect(pendingAfter(`<div title="bo`)).toEqual<Partial>({ type: "none" });
  });
});

describe("Tokenizer — chunking invariance (PLAN §5)", () => {
  const inputs = [
    "<div>Hello</div>",
    "<div><span>hi</span> world</div>",
    `<a href="x" title='y' disabled>text</a>`,
    "<><b>bold</b> and <i>italic</i></>",
    "<br /><hr/><img />",
    "plain text only",
    "<Card><Button label='ok' primary /></Card>",
    "  <div>  spaced  </div>  ",
    `<a t="a<b>{c}">deep</a>`,
  ];

  for (const input of inputs) {
    it(`is invariant for: ${JSON.stringify(input)}`, () => {
      const whole = tokenize(input);
      // Every fixed chunk size, including 1-char chunks.
      for (let size = 1; size <= input.length; size++) {
        expect(tokenize(input, fixedChunks(input, size))).toEqual(whole);
      }
    });
  }

  it("is invariant under randomized splits", () => {
    const input = "<section id='s'><h1>Title</h1><p class='lead'>Body text here.</p></section>";
    const whole = tokenize(input);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial++) {
      const sizes: number[] = [];
      let remaining = input.length;
      while (remaining > 0) {
        const take = 1 + Math.floor(rand() * Math.min(5, remaining));
        sizes.push(take);
        remaining -= take;
      }
      expect(tokenize(input, sizes)).toEqual(whole);
    }
  });

  it("handles multi-byte characters split across iteration", () => {
    // The tokenizer receives decoded strings; ensure code points survive
    // accumulation regardless of chunking (byte-level splits are the decoder's
    // job, handled in Phase 4).
    const input = "<p>café 😀 漢字</p>";
    const whole = tokenize(input);
    expect(whole).toEqual<Token[]>([
      { type: "openTagStart", name: "p" },
      { type: "openTagEnd" },
      { type: "text", value: "café 😀 漢字" },
      { type: "closeTag", name: "p" },
    ]);
    for (let size = 1; size <= input.length; size++) {
      expect(tokenize(input, fixedChunks(input, size))).toEqual(whole);
    }
  });
});
