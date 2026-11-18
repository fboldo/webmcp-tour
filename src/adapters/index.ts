// Adapters: getModelContext() over document.modelContext (+ legacy navigator fallback).
// Absorbs spec churn so the tools layer sees one small shape.
/** What `registerTool` takes: any WebMCP tool, including ours and the ones you write. */
export interface RegistrableTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean; consequentialHint?: boolean };
  execute(input: Record<string, unknown>, options: { signal: AbortSignal }): unknown;
}

/** The slice of WebMCP's `ModelContext` this library uses. */
export interface ModelContextLike {
  /** Rejects with `InvalidStateError` on a duplicate name; unregisters when `signal` aborts. */
  registerTool(tool: RegistrableTool, options?: { signal?: AbortSignal }): Promise<unknown> | unknown;
}

const INFORMED = Symbol.for("webmcp-tour.informed");

function why(): string {
  if (!globalThis.isSecureContext) return "this page is not a secure context (WebMCP needs https or localhost)";
  const policy = ((document as { permissionsPolicy?: unknown }).permissionsPolicy ?? (document as { featurePolicy?: unknown }).featurePolicy) as
    | { features?: () => string[]; allowsFeature?: (f: string) => boolean }
    | undefined;
  if (policy?.features?.().includes("tools") && policy.allowsFeature?.("tools") === false) return "the `tools` Permissions-Policy blocks WebMCP here";
  return "this browser has no WebMCP API (document.modelContext)";
}

/**
 * The page's model context, or `null` with one `console.info` naming why
 * (once per page, even when a script tag and a bundle both ask).
 */
export function getModelContext(): ModelContextLike | null {
  if (typeof document === "undefined") return null;
  const found = (document as { modelContext?: ModelContextLike }).modelContext ?? (globalThis.navigator as { modelContext?: ModelContextLike } | undefined)?.modelContext;
  if (found && typeof found.registerTool === "function") return found;
  const slot = globalThis as { [INFORMED]?: true };
  if (!slot[INFORMED]) {
    slot[INFORMED] = true;
    console.info(`webmcp-tour: tools not registered, ${why()}.`);
  }
  return null;
}
