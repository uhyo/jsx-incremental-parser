/**
 * Incremental, resumable JSX tokenizer (PLAN.md §4.2).
 *
 * A character-level state machine that consumes as much of each chunk as it can
 * and **retains partial state across chunk boundaries**: it can be cut off
 * mid-tag, mid-attribute, or mid-text and resume cleanly when more characters
 * arrive. The key correctness property (PLAN.md §5) is that the emitted token
 * stream does not depend on how the input is split into chunks.
 *
 * The tokenizer additionally exposes {@link Tokenizer.getPending}, describing
 * the half-read construct at the cursor. Only partial *text* is renderable; a
 * partial tag/attribute contributes nothing visible (it is hidden until it
 * completes), which is what the frontier model in PLAN.md §1 relies on.
 *
 * Expression containers (`{ ... }`) are handled in Phase 5; this phase covers
 * text, elements, fragments, attributes (string + boolean shorthand),
 * self-closing tags, and closing tags.
 */

/** The value of an attribute. */
export type AttrValue =
  | { type: "string"; value: string }
  /** Boolean shorthand: `disabled` desugars to `disabled={true}`. */
  | { type: "boolean" }
  /** Expression value `attr={...}`; `raw` is the inner source. */
  | { type: "expression"; raw: string };

/** A completed token emitted by the tokenizer. */
export type Token =
  /** Start of an opening tag; `name` is `""` for a fragment (`<>`). */
  | { type: "openTagStart"; name: string }
  | { type: "attribute"; name: string; value: AttrValue }
  /** `>` terminating an opening tag (the element becomes "open"). */
  | { type: "openTagEnd" }
  /** `/>` terminating a self-closing element. */
  | { type: "selfClose" }
  /** A closing tag; `name` is `""` for a fragment close (`</>`). */
  | { type: "closeTag"; name: string }
  /** A complete run of child text. */
  | { type: "text"; value: string }
  /** A complete child expression container `{...}`; `raw` is the inner source. */
  | { type: "expr"; raw: string };

/** The half-read construct at the cursor; see PLAN.md §1. */
export type Partial =
  /** Nothing renderable is pending (idle, or mid-tag/-attribute). */
  | { type: "none" }
  /** A run of child text accumulated so far but not yet terminated. */
  | { type: "text"; value: string };

const enum State {
  Text,
  TagOpen,
  TagName,
  BeforeAttrName,
  AttrName,
  AfterAttrName,
  BeforeAttrValue,
  AttrValueString,
  SelfClose,
  CloseTagName,
  CloseTagEnd,
  Expression,
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

function isNameStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isNameChar(ch: string): boolean {
  return isNameStart(ch) || (ch >= "0" && ch <= "9") || ch === "-" || ch === ".";
}

/**
 * A resumable JSX tokenizer. Feed chunks with {@link write}, signal the end of
 * the stream with {@link end}, and read the current frontier with
 * {@link getPending}.
 */
export class Tokenizer {
  private state: State = State.Text;
  /** Accumulated child text (State.Text). */
  private text = "";
  /** Accumulated tag name (open or close). */
  private name = "";
  /** Accumulated attribute name. */
  private attrName = "";
  /** Accumulated attribute string value. */
  private attrValue = "";
  /** The quote character opening the current attribute string. */
  private quote = "";
  /** When true, the current character is re-processed in the new state. */
  private reconsume = false;

  // --- Expression container (`{ ... }`) scanning state ---
  /** Accumulated raw expression source (between the outer braces). */
  private exprRaw = "";
  /** Brace nesting depth; 0 means the matching `}` has been found. */
  private exprDepth = 0;
  /** The quote currently open inside the expression (`` empty if none). */
  private exprQuote = "";
  /** True if the next expression char is escaped (inside a string). */
  private exprEscape = false;
  /** True if this expression is an attribute value (vs a child). */
  private exprIsAttr = false;
  /** The attribute name when {@link exprIsAttr}. */
  private exprAttrName = "";

  /** Feed a string chunk; returns the tokens completed by this chunk. */
  write(chunk: string): Token[] {
    const out: Token[] = [];
    for (const ch of chunk) {
      do {
        this.reconsume = false;
        this.step(ch, out);
      } while (this.reconsume);
    }
    return out;
  }

  /**
   * Signal end of input. Flushes any trailing text run. Incomplete tags or
   * attributes are discarded (they never became renderable); richer recovery
   * arrives in Phase 7.
   */
  end(): Token[] {
    const out: Token[] = [];
    if (this.state === State.Text && this.text.length > 0) {
      out.push({ type: "text", value: this.text });
      this.text = "";
    }
    return out;
  }

  /** The half-read construct at the cursor (PLAN.md §1). */
  getPending(): Partial {
    if (this.state === State.Text && this.text.length > 0) {
      return { type: "text", value: this.text };
    }
    return { type: "none" };
  }

  private emitBooleanAttr(out: Token[]): void {
    out.push({ type: "attribute", name: this.attrName, value: { type: "boolean" } });
    this.attrName = "";
  }

  private step(ch: string, out: Token[]): void {
    switch (this.state) {
      case State.Text: {
        if (ch === "<") {
          this.flushText(out);
          this.state = State.TagOpen;
        } else if (ch === "{") {
          this.flushText(out);
          this.startExpression(false);
        } else {
          this.text += ch;
        }
        return;
      }

      case State.TagOpen: {
        if (ch === "/") {
          this.name = "";
          this.state = State.CloseTagName;
        } else if (ch === ">") {
          // Fragment open: `<>`.
          out.push({ type: "openTagStart", name: "" });
          out.push({ type: "openTagEnd" });
          this.state = State.Text;
        } else if (isNameStart(ch)) {
          this.name = ch;
          this.state = State.TagName;
        }
        // Otherwise (whitespace or stray char) stay lenient and ignore.
        return;
      }

      case State.TagName: {
        if (isNameChar(ch)) {
          this.name += ch;
        } else if (ch === "=") {
          // Defensive: a name char set excludes `=`; ignore leniently.
        } else {
          out.push({ type: "openTagStart", name: this.name });
          this.name = "";
          this.state = State.BeforeAttrName;
          this.reconsume = true;
        }
        return;
      }

      case State.BeforeAttrName: {
        if (isWhitespace(ch)) {
          // Skip.
        } else if (ch === ">") {
          out.push({ type: "openTagEnd" });
          this.state = State.Text;
        } else if (ch === "/") {
          this.state = State.SelfClose;
        } else if (isNameStart(ch)) {
          this.attrName = ch;
          this.state = State.AttrName;
        }
        // Otherwise ignore.
        return;
      }

      case State.AttrName: {
        if (isNameChar(ch)) {
          this.attrName += ch;
        } else if (ch === "=") {
          this.state = State.BeforeAttrValue;
        } else if (isWhitespace(ch)) {
          // Could be a boolean attr or an `=` may still follow.
          this.state = State.AfterAttrName;
        } else {
          // `>` or `/`: boolean attr, then re-handle the delimiter.
          this.emitBooleanAttr(out);
          this.state = State.BeforeAttrName;
          this.reconsume = true;
        }
        return;
      }

      case State.AfterAttrName: {
        if (isWhitespace(ch)) {
          // Skip.
        } else if (ch === "=") {
          this.state = State.BeforeAttrValue;
        } else {
          // New attr, `>` or `/`: the previous bare name was boolean.
          this.emitBooleanAttr(out);
          this.state = State.BeforeAttrName;
          this.reconsume = true;
        }
        return;
      }

      case State.BeforeAttrValue: {
        if (isWhitespace(ch)) {
          // Skip.
        } else if (ch === '"' || ch === "'") {
          this.quote = ch;
          this.attrValue = "";
          this.state = State.AttrValueString;
        } else if (ch === "{") {
          this.startExpression(true);
        }
        // Unquoted values remain out of scope.
        return;
      }

      case State.AttrValueString: {
        if (ch === this.quote) {
          out.push({
            type: "attribute",
            name: this.attrName,
            value: { type: "string", value: this.attrValue },
          });
          this.attrName = "";
          this.attrValue = "";
          this.quote = "";
          this.state = State.BeforeAttrName;
        } else {
          this.attrValue += ch;
        }
        return;
      }

      case State.SelfClose: {
        if (ch === ">") {
          out.push({ type: "selfClose" });
          this.state = State.Text;
        }
        // Lenient: ignore anything between `/` and `>`.
        return;
      }

      case State.CloseTagName: {
        if (isNameChar(ch)) {
          this.name += ch;
        } else if (ch === ">") {
          out.push({ type: "closeTag", name: this.name });
          this.name = "";
          this.state = State.Text;
        } else if (isWhitespace(ch)) {
          this.state = State.CloseTagEnd;
        }
        // Otherwise ignore.
        return;
      }

      case State.CloseTagEnd: {
        if (ch === ">") {
          out.push({ type: "closeTag", name: this.name });
          this.name = "";
          this.state = State.Text;
        }
        // Skip whitespace / ignore stray chars.
        return;
      }

      case State.Expression: {
        if (this.exprQuote) {
          // Inside a string/template literal: copy verbatim, honoring escapes,
          // so braces and quotes within it do not affect nesting.
          this.exprRaw += ch;
          if (this.exprEscape) this.exprEscape = false;
          else if (ch === "\\") this.exprEscape = true;
          else if (ch === this.exprQuote) this.exprQuote = "";
          return;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          this.exprQuote = ch;
          this.exprRaw += ch;
          return;
        }
        if (ch === "{") {
          this.exprDepth++;
          this.exprRaw += ch;
          return;
        }
        if (ch === "}") {
          this.exprDepth--;
          if (this.exprDepth === 0) {
            this.finishExpression(out);
            return;
          }
          this.exprRaw += ch;
          return;
        }
        this.exprRaw += ch;
        return;
      }
    }
  }

  private flushText(out: Token[]): void {
    if (this.text.length > 0) {
      out.push({ type: "text", value: this.text });
      this.text = "";
    }
  }

  private startExpression(isAttr: boolean): void {
    this.exprRaw = "";
    this.exprDepth = 1;
    this.exprQuote = "";
    this.exprEscape = false;
    this.exprIsAttr = isAttr;
    this.exprAttrName = isAttr ? this.attrName : "";
    this.state = State.Expression;
  }

  private finishExpression(out: Token[]): void {
    if (this.exprIsAttr) {
      out.push({
        type: "attribute",
        name: this.exprAttrName,
        value: { type: "expression", raw: this.exprRaw },
      });
      this.attrName = "";
      this.state = State.BeforeAttrName;
    } else {
      out.push({ type: "expr", raw: this.exprRaw });
      this.state = State.Text;
    }
    this.exprRaw = "";
    this.exprAttrName = "";
  }
}
