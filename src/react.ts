/**
 * React hook entry point (`jsx-incremental-parser/react`).
 *
 * `useIncrementalJsx` drives an {@link IncrementalJsxParser} through
 * `useSyncExternalStore`, handling lifecycle (create on mount, dispose on
 * unmount, re-create when the source identity changes).
 *
 * The real implementation arrives in Phase 6 (see PLAN.md §3.2). Phase 0 only
 * establishes the package scaffold and the public type surface.
 */

import type { ReactNode } from "react";
import type { IncrementalJsxParserOptions, JsxStreamSource } from "./index";

export type { IncrementalJsxParserOptions, JsxStreamSource } from "./index";

/**
 * Render a streamed JSX source as a live React tree.
 *
 * @remarks Not implemented yet — Phase 0 scaffold only.
 */
export function useIncrementalJsx(
  _source: JsxStreamSource,
  _options?: IncrementalJsxParserOptions,
): ReactNode {
  throw new Error("useIncrementalJsx is not implemented yet (Phase 0 scaffold).");
}
