# jsx-incremental-parser

Incrementally parse a **streamed JSX string** into a **live React tree**.

As JSX text arrives chunk-by-chunk (for example, AI-generated UI streaming from
a server), this library keeps a snapshot of the parsed tree up to date. Whatever
has not finished streaming yet is represented by a single `<Pending />`
placeholder at the streaming frontier, so you can render a spinner, skeleton, or
shimmer exactly where the next content will appear.

- **Incremental & cheap** — settled subtrees are frozen and reused; only the
  open path and the single `Pending` are rebuilt per chunk.
- **Chunk-independent** — the result never depends on how the byte/character
  stream happens to be split (verified by fuzz tests).
- **Lenient by design** — malformed or truncated AI output degrades gracefully
  instead of throwing.
- **Framework-agnostic core** — the `/core` entry has zero React dependency.

> **Status:** early development (`0.0.0`). The API described here is implemented
> and tested, but may still change before a stable release.

## Install

```sh
npm install jsx-incremental-parser
# react / react-dom are peer dependencies (>= 18)
```

## Quick start (React hook)

```tsx
import { useIncrementalJsx } from "jsx-incremental-parser/react";

function StreamedUI({ stream }: { stream: ReadableStream<Uint8Array> }) {
  return useIncrementalJsx(stream, {
    components: { Card, Button },
    Pending: () => <span className="shimmer" />,
  });
}

// e.g. drive it from a fetch:
const res = await fetch("/api/ui-stream");
<StreamedUI stream={res.body!} />;
```

The hook subscribes via `useSyncExternalStore`, re-rendering only when the parsed
tree changes, and disposes the stream automatically on unmount.

## The core idea: a single frontier

A stream is one linear sequence of characters, so at any instant there is exactly
**one cursor** between "received" and "not yet received". While the stream is
open, the snapshot therefore contains **exactly one `<Pending />`**, nested inside
whatever elements are currently open:

| Received so far    | Snapshot                                            |
| ------------------ | --------------------------------------------------- |
| `<div>`            | `<div><Pending/></div>`                             |
| `<div>Hello`       | `<div>Hello<Pending/></div>`                        |
| `<div><span>`      | `<div><span><Pending/></span></div>`                |
| `<div><sp`         | `<div><Pending/></div>` (partial child tag hidden)  |
| `<div title="bo`   | `<Pending/>` (unfinished open tag → div hidden)      |
| `<div>{`           | `<div><Pending/></div>` (unfinished expression)     |
| `<div>a</div>` eof | `<div>a</div>` (no Pending once the stream ends)     |

## Supported JSX subset

This is **not** a JavaScript parser. It recognizes a small, safe JSX subset:

- **Elements** — host/intrinsic (`<div>`, lowercase), components (`<Card>`,
  Capitalized, resolved via `components` / `resolveComponent`), self-closing
  (`<br />`), and fragments (`<>…</>`).
- **Attributes** — string values (`prop="x"`, `prop='x'`), boolean shorthand
  (`disabled` → `disabled={true}`), and expression values `prop={…}`.
- **Children** — text, nested elements/fragments, and expression containers
  `{…}`.
- **Expressions** inside `{ }` (props and children) are limited to: string and
  template literals **without** `${}` substitutions, number literals,
  `true` / `false` / `null` / `undefined`, and a nested JSX element/fragment.

Anything outside this subset (identifiers, member access, calls, arithmetic,
spreads, …) is treated as a recoverable error: it renders as nothing and is
reported through `onError`.

## API

### `useIncrementalJsx(source, options?)` — `jsx-incremental-parser/react`

React hook returning the live `ReactNode`. Re-creates the parser when `source`
identity changes and disposes it on unmount.

### `createIncrementalJsxParser(source, options?)` — `jsx-incremental-parser`

Lower-level React store, shaped as a drop-in for `useSyncExternalStore`:

```ts
const parser = createIncrementalJsxParser(source, options);

parser.getSnapshot(); // => ReactNode (stable ref until the tree changes)
parser.getServerSnapshot(); // SSR-safe snapshot
const unsubscribe = parser.subscribe(() => {/* re-render */});
parser.dispose(); // cancel the stream and detach
await parser.done; // resolves on completion, rejects on a fatal stream error
```

**Accepted `source` types:** `ReadableStream<Uint8Array>` (decoded with a
streaming `TextDecoder` — the common `fetch().body` case),
`ReadableStream<string>`, or any `AsyncIterable<string | Uint8Array>`.

**Options:**

| Option               | Type                                                | Default        | Description                                                        |
| -------------------- | --------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `components`         | `Record<string, ComponentType>`                     | —              | Map of Capitalized tag names to React components.                 |
| `resolveComponent`   | `(name) => ComponentType \| undefined`              | —              | Resolver consulted before `components`.                           |
| `Pending`            | `ComponentType`                                      | renders `null` | Placeholder rendered at the frontier.                             |
| `onUnknownComponent` | `"pending" \| "error" \| "passthrough"`             | `"pending"`    | What to do with an unresolved component tag.                      |
| `mismatchedTag`      | `"autoclose" \| "ignore" \| "error"`                | `"autoclose"`  | How to handle a closing tag that doesn't match the open element.  |
| `onError`            | `(error, info: { phase }) => void`                  | —              | Called on recoverable parse / stream / render errors.            |

The `components` map also acts as a **security allowlist** for untrusted
AI-generated output — unknown components do not render by default.

### `createParser(options?)` — `jsx-incremental-parser/core`

Framework-agnostic, push-based core that emits a renderer-independent AST. Zero
React dependency.

```ts
import { createParser } from "jsx-incremental-parser/core";

const core = createParser();
core.write("<div>partial");
core.getTree(); // => readonly Node[] (immutable AST snapshot, incl. a PendingNode)
core.subscribe(listener);
core.end(); // finalize; drops the Pending frontier
```

## Error handling

AI output is frequently malformed, so the parser is **lenient by default**:

- **Missing close tags** at end of stream are auto-closed (best-effort content).
- **Mismatched closing tags** mid-stream follow `mismatchedTag` (default
  `"autoclose"`).
- **Unsupported expressions** render as nothing and are reported via `onError`.
- **Source read errors** reject `done` and call `onError`; the last good
  snapshot is always preserved — errors never blank the UI.

## License

MIT © uhyo
