/**
 * Framework-agnostic incremental JSX parser core.
 *
 * This is the low-level, push-based entry point (`jsx-incremental-parser/core`).
 * It emits a renderer-independent AST snapshot; the React adapter (the package
 * root entry) is a thin layer on top.
 *
 * The real implementation arrives in later phases (see PLAN.md §4, phases 1-5).
 * Phase 0 only establishes the package scaffold and the public type surface.
 */

/** A node in the renderer-independent AST. */
export type Node = ElementNode | FragmentNode | TextNode | ExpressionNode;

export interface ElementNode {
  kind: "element";
  id: number;
  tag: string;
  props: Record<string, PropValue>;
  children: Node[];
  status: "open" | "closed";
}

export interface FragmentNode {
  kind: "fragment";
  id: number;
  children: Node[];
  status: "open" | "closed";
}

export interface TextNode {
  kind: "text";
  id: number;
  value: string;
}

export interface ExpressionNode {
  kind: "expression";
  id: number;
  value: unknown;
}

/** A resolved prop value (string literal, expression literal, or nested node). */
export type PropValue = string | number | boolean | null | undefined | Node;

export type Listener = () => void;
export type Unsubscribe = () => void;

/** The low-level, push-based parser store. */
export interface Parser {
  /** Feed a string chunk into the parser. */
  write(chunk: string): void;
  /** Signal end of stream; drops the trailing `Pending` frontier. */
  end(): void;
  /** Current immutable AST snapshot (top-level node list). */
  getTree(): readonly Node[];
  /** Subscribe to snapshot updates; returns an unsubscribe function. */
  subscribe(listener: Listener): Unsubscribe;
}

/**
 * Create a low-level, push-based incremental JSX parser.
 *
 * @remarks Not implemented yet — Phase 0 scaffold only.
 */
export function createParser(): Parser {
  throw new Error("createParser is not implemented yet (Phase 0 scaffold).");
}
