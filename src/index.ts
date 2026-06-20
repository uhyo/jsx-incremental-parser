/**
 * React adapter — the primary, documented entry point
 * (`jsx-incremental-parser`).
 *
 * Wraps the framework-agnostic {@link createParser | core} and converts the AST
 * snapshot into a `React.ReactNode`, injecting a `<Pending />` placeholder at
 * the streaming frontier.
 *
 * The real implementation arrives in later phases (see PLAN.md §3.1, §4.5).
 * Phase 0 only establishes the package scaffold and the public type surface.
 */

import type { ComponentType, ReactNode } from "react";

export type { Node, ElementNode, FragmentNode, TextNode, ExpressionNode, PropValue } from "./core";

/** How to handle a component tag that is not in the `components` map. */
export type UnknownComponentBehavior = "pending" | "error" | "passthrough";

/** Accepted stream sources for {@link createIncrementalJsxParser}. */
export type JsxStreamSource =
  | ReadableStream<Uint8Array>
  | ReadableStream<string>
  | AsyncIterable<string | Uint8Array>;

export interface IncrementalJsxParserOptions {
  /** Tag name -> React component map for capitalized JSX names. */
  components?: Record<string, ComponentType<unknown>>;
  /** Placeholder rendered at the streaming frontier (default: renders null). */
  Pending?: ComponentType<unknown>;
  /** Optional resolver, consulted before/after the `components` map. */
  resolveComponent?: (name: string) => ComponentType<unknown> | undefined;
  /** Behavior for an unresolved component tag (default: "pending"). */
  onUnknownComponent?: UnknownComponentBehavior;
  /** Called on a recoverable parse/stream error. */
  onError?: (error: unknown, info: { phase: string }) => void;
}

/**
 * A React-friendly store: drop-in shaped for `useSyncExternalStore`
 * (`subscribe` + `getSnapshot`), plus lifecycle helpers.
 */
export interface IncrementalJsxParser {
  /** Current React snapshot (stable reference until the tree changes). */
  getSnapshot(): ReactNode;
  /** SSR-safe snapshot. */
  getServerSnapshot(): ReactNode;
  /** Subscribe to updates; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Cancel the stream and detach. */
  dispose(): void;
  /** Resolves when the stream completes, rejects on fatal error. */
  readonly done: Promise<void>;
}

/**
 * Create an incremental JSX parser bound to a stream source.
 *
 * @remarks Not implemented yet — Phase 0 scaffold only.
 */
export function createIncrementalJsxParser(
  _source: JsxStreamSource,
  _options?: IncrementalJsxParserOptions,
): IncrementalJsxParser {
  throw new Error("createIncrementalJsxParser is not implemented yet (Phase 0 scaffold).");
}
