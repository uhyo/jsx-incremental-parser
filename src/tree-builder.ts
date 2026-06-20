/**
 * Tree builder & frontier model (PLAN.md §4.3–§4.4).
 *
 * Consumes the {@link Token} stream and maintains:
 *  - the committed AST (top-level node list), where every *closed* node is
 *    frozen and never mutated again (the append-only property that makes the
 *    parser incremental rather than a re-parse per chunk), and
 *  - a stack of currently open elements/fragments.
 *
 * {@link TreeBuilder.snapshot} produces the live tree by overlaying the single
 * frontier — any partial text plus one {@link PendingNode} — onto the innermost
 * open node, cloning only the open path so closed subtrees keep their identity.
 */

import type {
  ElementNode,
  ExpressionNode,
  FragmentNode,
  Node,
  PendingNode,
  PropValue,
  TextNode,
} from "./core";
import { parseExpression } from "./expression";
import type { AttrValue, Partial, Token } from "./tokenizer";
import { Tokenizer } from "./tokenizer";

/** A node that can still receive children (sits on the open stack). */
type OpenNode = ElementNode | FragmentNode;

/** The single frontier marker has a fixed key (only ever one exists at a time). */
const PENDING_ID = -1;

/** An opening tag being assembled between `openTagStart` and `openTagEnd`. */
interface Building {
  name: string;
  props: Record<string, PropValue>;
}

export class TreeBuilder {
  private nextId = 0;
  /** Committed top-level nodes (append-only; the open path is mutated in place). */
  private readonly roots: Node[] = [];
  /** Currently open nodes, outermost first; the last is the frontier's parent. */
  private readonly openStack: OpenNode[] = [];
  /** The opening tag currently being assembled, if any. */
  private building: Building | null = null;
  /** Stable id reserved for the in-progress text run (shared with its commit). */
  private currentTextId: number | null = null;
  private ended = false;

  /** Apply one completed token to the committed tree. */
  push(token: Token): void {
    switch (token.type) {
      case "openTagStart": {
        this.building = { name: token.name, props: {} };
        return;
      }
      case "attribute": {
        if (this.building) {
          this.building.props[token.name] = this.attrToProp(token.value);
        }
        return;
      }
      case "openTagEnd": {
        const node = this.createOpenNode();
        if (node) {
          this.appendChild(node);
          this.openStack.push(node);
        }
        this.building = null;
        return;
      }
      case "selfClose": {
        const node = this.createOpenNode();
        if (node) {
          node.status = "closed";
          this.appendChild(node);
          freeze(node);
        }
        this.building = null;
        return;
      }
      case "closeTag": {
        this.closeTop();
        return;
      }
      case "text": {
        const id = this.currentTextId ?? this.nextId++;
        this.currentTextId = null;
        const node: TextNode = { kind: "text", id, value: token.value };
        this.appendChild(freeze(node));
        return;
      }
      case "expr": {
        const value = parseExpression(token.raw, (src) => this.parseJsx(src));
        const node: ExpressionNode = { kind: "expression", id: this.nextId++, value };
        this.appendChild(freeze(node));
        return;
      }
    }
  }

  private attrToProp(value: AttrValue): PropValue {
    switch (value.type) {
      case "string":
        return value.value;
      case "boolean":
        return true;
      case "expression":
        // The sentinel for an unsupported expression is detected by the adapter.
        return parseExpression(value.raw, (src) => this.parseJsx(src)) as PropValue;
    }
  }

  /** Parse a nested JSX expression by running a fresh, self-contained parse. */
  private parseJsx(src: string): Node | undefined {
    const tokenizer = new Tokenizer();
    const builder = new TreeBuilder();
    for (const token of tokenizer.write(src)) builder.push(token);
    for (const token of tokenizer.end()) builder.push(token);
    builder.end();
    const nodes = builder.snapshot({ type: "none" });
    if (nodes.length === 0) return undefined;
    if (nodes.length === 1) return nodes[0];
    const fragment: FragmentNode = {
      kind: "fragment",
      id: -2,
      children: [...nodes],
      status: "closed",
    };
    return freeze(fragment);
  }

  /**
   * Finalize the stream: close any still-open nodes (best-effort; richer
   * recovery arrives in Phase 7) and drop the frontier.
   */
  end(): void {
    while (this.openStack.length > 0) this.closeTop();
    this.building = null;
    this.ended = true;
  }

  /**
   * The live tree: committed nodes plus the frontier (partial text + a single
   * {@link PendingNode}) while the stream is open. After {@link end} the
   * frontier is gone and the committed roots are returned directly.
   */
  snapshot(pending: Partial): readonly Node[] {
    if (this.ended) return this.roots;

    const extras: Node[] = [];
    if (pending.type === "text") {
      this.currentTextId ??= this.nextId++;
      const textNode: TextNode = { kind: "text", id: this.currentTextId, value: pending.value };
      extras.push(textNode);
    }
    const pendingNode: PendingNode = { kind: "pending", id: PENDING_ID };
    extras.push(pendingNode);

    return this.withFrontier(extras);
  }

  private createOpenNode(): OpenNode | null {
    const building = this.building;
    if (!building) return null;
    const id = this.nextId++;
    if (building.name === "") {
      return { kind: "fragment", id, children: [], status: "open" };
    }
    return {
      kind: "element",
      id,
      tag: building.name,
      props: Object.freeze(building.props),
      children: [],
      status: "open",
    };
  }

  /** Pop and freeze the innermost open node. */
  private closeTop(): void {
    const node = this.openStack.pop();
    if (!node) return;
    node.status = "closed";
    freeze(node);
  }

  /** Append a node to the innermost open node, or to the root list. */
  private appendChild(node: Node): void {
    const parent = this.openStack[this.openStack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      this.roots.push(node);
    }
  }

  /** Clone the open path so `extras` can be appended without mutating the tree. */
  private withFrontier(extras: Node[]): readonly Node[] {
    const stack = this.openStack;
    if (stack.length === 0) {
      return extras.length > 0 ? [...this.roots, ...extras] : this.roots;
    }

    // Deepest open node: clone with its committed children + the frontier.
    let child: OpenNode = cloneOpen(stack[stack.length - 1]!, [
      ...stack[stack.length - 1]!.children,
      ...extras,
    ]);
    // Walk up: each parent's last child is the open node we just cloned.
    for (let i = stack.length - 2; i >= 0; i--) {
      const parent = stack[i]!;
      const children = parent.children.slice(0, -1);
      children.push(child);
      child = cloneOpen(parent, children);
    }
    // stack[0] is the last committed root; replace it with the cloned path.
    return [...this.roots.slice(0, -1), child];
  }
}

function cloneOpen(node: OpenNode, children: Node[]): OpenNode {
  if (node.kind === "fragment") {
    return { kind: "fragment", id: node.id, children, status: node.status };
  }
  return {
    kind: "element",
    id: node.id,
    tag: node.tag,
    props: node.props,
    children,
    status: node.status,
  };
}

function freeze<T extends Node>(node: T): T {
  if (node.kind === "element" || node.kind === "fragment") {
    Object.freeze(node.children);
  }
  return Object.freeze(node);
}
