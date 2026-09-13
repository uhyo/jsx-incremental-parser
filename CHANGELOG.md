# jsx-incremental-parser

## 0.1.0

### Minor Changes

- feae30a: Initial release: incrementally parse a streamed JSX string into a live React
  tree, rendering the not-yet-arrived part as a single `<Pending />` placeholder at
  the streaming frontier.

  - React hook (`useIncrementalJsx`) and store (`createIncrementalJsxParser`).
  - Framework-agnostic, push-based core (`createParser`) with zero React dependency.
  - Resumable, chunk-independent tokenizer; append-only AST with memoized,
    referentially-stable closed subtrees.
  - Supported JSX subset: host/component elements, fragments, self-closing tags,
    string/boolean/expression attributes, and `{ }` expressions (string/template
    literals without substitutions, numbers, `true`/`false`/`null`/`undefined`,
    and nested JSX).
  - Lenient error handling (auto-close, configurable `mismatchedTag`).

- 098477a: Report source locations on JSX errors. Every `JsxErrorEvent` now carries a
  `location: SourceLocation` — 1-based `line`/`column`, stream `offset`, and
  `lineText` (the content of the offending line, as streamed so far) — pointing
  at the offending construct: the `<` of a mismatched/unknown/unclosed tag, the
  `{` of an unsupported expression. Errors inside a nested JSX expression are
  reported at the enclosing `{`.

  New `formatJsxError(event)` export (root and `/core` entries) renders the
  message, position, and a caret code frame in one string:

  ```text
  Mismatched closing tag </b>; expected </a> (line 2, column 8)

    2 |   hello</b>
      |        ^
  ```

  Locations are chunking-invariant like the rest of the token stream.

- 38a8d65: Restructure error handling into two channels split by recoverability.

  `onJsxError` is the channel for **recoverable** errors: unified, structured
  JSX-level events that fire synchronously at parse time (inside `write()` /
  `end()`), before any render and in every recovery mode, so a stream producer
  (e.g. an LLM agent) can get instant feedback while the tree keeps recovering
  tolerantly as before. The `JsxErrorEvent` union covers `"mismatched-tag"`
  (including stray closes), `"unknown-component"`, `"unsupported-expression"`,
  and `"unclosed-tag"` at end of input; each event carries a human-readable
  `message`.

  `onStreamError` is the channel for the one **unrecoverable** error: the
  stream source failing. It receives the raw error once, alongside the existing
  `done` rejection.

  The core `createParser` accepts `onJsxError` too, plus an `isKnownComponent`
  predicate to enable unknown-component detection without React; the
  `isComponentName` helper is now exported.

  Breaking (pre-release cleanup): the legacy `onError` callback is removed —
  use `onJsxError` / `onStreamError`. Reporting is now decoupled from recovery,
  so the reporting-only modes are gone: `mismatchedTag` is
  `"autoclose" | "ignore"` (the `"error"` mode behaved like `"ignore"` plus a
  report), and `onUnknownComponent`'s `"error"` mode is renamed `"skip"`
  (renders nothing).
