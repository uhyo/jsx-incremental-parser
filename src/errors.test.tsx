import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createRenderer } from "./render";
import { Tokenizer } from "./tokenizer";
import { TreeBuilder, type MismatchBehavior } from "./tree-builder";

function html(
  input: string,
  opts: {
    mismatchedTag?: MismatchBehavior;
    onError?: (e: unknown, i: { phase: string }) => void;
    end?: boolean;
  } = {},
): string {
  const tk = new Tokenizer();
  const tb = new TreeBuilder({ mismatchedTag: opts.mismatchedTag, onError: opts.onError });
  for (const token of tk.write(input)) tb.push(token);
  if (opts.end ?? true) {
    for (const token of tk.end()) tb.push(token);
    tb.end();
  }
  const r = createRenderer({});
  return renderToStaticMarkup(
    createElement(Fragment, null, r.render(tb.snapshot(tk.getPending()))),
  );
}

describe("Error handling — missing close tags", () => {
  it("auto-closes still-open elements at end of stream", () => {
    expect(html("<div><span>hi")).toBe("<div><span>hi</span></div>");
    // This is JSX, not HTML: unclosed siblings nest, then all auto-close at EOF.
    expect(html("<ul><li>a<li>b")).toBe("<ul><li>a<li>b</li></li></ul>");
  });
});

describe("Error handling — mismatched closing tags", () => {
  it("autoclose (default): a non-matching close ends the innermost element", () => {
    expect(html("<a>x</b>")).toBe("<a>x</a>");
  });

  it("autoclose: a matching ancestor closes intermediate elements", () => {
    expect(html("<a><b>x</a>")).toBe("<a><b>x</b></a>");
  });

  it("ignore: non-matching close tags are dropped", () => {
    expect(html("<a>x</b>y", { mismatchedTag: "ignore" })).toBe("<a>xy</a>");
  });

  it("error: reports via onError and leaves the structure intact", () => {
    const onError = vi.fn();
    expect(html("<a>x</b>", { mismatchedTag: "error", onError })).toBe("<a>x</a>");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![1]).toEqual({ phase: "parse" });
  });

  it("ignores a stray closing tag with nothing open", () => {
    expect(html("</div>foo")).toBe("foo");
  });
});

describe("Error handling — truncated input", () => {
  it("drops a partial child tag", () => {
    expect(html("<div><spa")).toBe("<div></div>");
  });

  it("drops an element whose opening tag never finished", () => {
    expect(html(`<a href="ab`)).toBe("");
  });

  it("drops a truncated expression", () => {
    expect(html("<p>{42")).toBe("<p></p>");
    expect(html("<p>{<b>unfinished")).toBe("<p></p>");
  });
});

describe("Error handling — last good snapshot is preserved (no end)", () => {
  it("keeps already-parsed content visible mid-stream", () => {
    // Without end(), the frontier Pending (default: null) is present but invisible.
    expect(html("<div>partial", { end: false })).toBe("<div>partial</div>");
  });
});
