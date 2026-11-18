import type { StepInput, Tour, WaitInput } from "../tour/index.js";
import { MAX_MESSAGE, MAX_TITLE } from "../tour/index.js";

/**
 * Tool names. Bridges rename tools (Playwright MCP exposes `webmcp_tour_show_step`),
 * so descriptions refer to siblings by role and interpolate these.
 */
export interface ToolNames {
  showStep: string;
  listTargets: string;
  dismiss: string;
  waitForInteraction: string;
}

export const DEFAULT_NAMES: Readonly<ToolNames> = {
  showStep: "tour_show_step",
  listTargets: "tour_list_targets",
  dismiss: "tour_dismiss",
  waitForInteraction: "tour_wait_for_interaction",
};

/** Failure envelopes carry `isError: true`: hosts that honour it (Playwright MCP) report an MCP error; others ignore it. */
export type ToolResult = ({ ok: true } | { ok: false; error: string; isError: true }) & Record<string, unknown>;

/** Structurally a WebMCP `ModelContextTool`, so it registers as is. */
export interface ToolDefinition {
  name: string;
  /** For the browser's own UI only: no tested bridge forwards it to the agent. */
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: true; untrustedContentHint?: true };
  /** Never throws or rejects. The second argument is the host's execution-time options (`{ signal }`). */
  execute(input: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<ToolResult>;
}

const NAME = /^[A-Za-z0-9_-]{1,57}$/;

export function toolNames(names: Partial<ToolNames> = {}): ToolNames {
  const all: ToolNames = { ...DEFAULT_NAMES, ...names };
  const values = Object.values(all);
  if (!values.every((n) => typeof n === "string" && NAME.test(n)) || new Set(values).size !== values.length)
    throw new TypeError("webmcp-tour: tool names must be distinct, 1-57 characters of letters, digits, _ or -");
  return all;
}

const wrap = (r: { ok: boolean } & Record<string, unknown>): ToolResult => (r.ok ? r : { ...r, isError: true }) as ToolResult;

const safe =
  (fn: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown): ToolDefinition["execute"] =>
  async (input, options) => {
    try {
      return wrap((await fn(input ?? {}, options)) as Parameters<typeof wrap>[0]);
    } catch {
      return wrap({ ok: false, error: "internal", message: "The tour failed unexpectedly; check the page and try again." });
    }
  };

/** Definitions for the tools, in registration order. Pure: touches no DOM and registers nothing. */
export function defineTools(tour: Tour, names?: Partial<ToolNames>): ToolDefinition[] {
  const n = toolNames(names);
  const str = (description?: string) => ({ type: "string", ...(description && { description }) });
  const ro = { readOnlyHint: true } as const;
  return [
    {
      name: n.showStep,
      title: "Show me where",
      description:
        "Highlight any element on the page and show a short explanation beside it, so the user can see which control you mean and act on it themselves. " +
        "Point at the element any way you like: a declared `target` id, a CSS `selector`, or its visible `text` (button label, link text, aria-label). " +
        "This only searches what is currently rendered in this document. `message` is required unless the target is declared with its own description. " +
        "If several elements match, the result lists them; call again with `index`. " +
        "This only points: it never clicks, submits, or changes anything. Do not tell the user an action succeeded just because you highlighted it.",
      inputSchema: {
        type: "object",
        properties: {
          target: str("Exactly one of target, selector, text."),
          selector: str(),
          text: str(),
          index: { type: "integer", minimum: 0, description: "Pick among listed candidates (0-based)." },
          title: str(`Plain text, max ${MAX_TITLE} characters.`),
          message: str(`Plain text, max ${MAX_MESSAGE} characters.`),
          placement: { type: "string", enum: ["auto", "above", "below"] },
        },
      },
      annotations: ro,
      execute: safe((input) => tour.show(input as StepInput)),
    },
    {
      name: n.listTargets,
      title: "List guided targets",
      description:
        "List the guided-tour targets the page author declared: stable ids, each with a label and a short description of what the control does. " +
        `If the list is empty, do not stop: point at the element directly with ${n.showStep}, by its visible text or a CSS selector.`,
      inputSchema: { type: "object", properties: {} },
      annotations: { ...ro, untrustedContentHint: true },
      execute: safe(() => {
        const { targets, total } = tour.targets();
        return { ok: true, targets, count: total, ...(total > targets.length ? { truncated: true } : {}) };
      }),
    },
    {
      name: n.dismiss,
      title: "Clear the highlight",
      description: "Remove the current highlight and explanation. Call when the user moves on, asks a different question, or says they found it.",
      inputSchema: { type: "object", properties: {} },
      annotations: ro,
      execute: safe(() => tour.dismiss()),
    },
    {
      name: n.waitForInteraction,
      title: "Wait for the user",
      description:
        `Wait until the user interacts with the highlighted element, or with one you name by \`target\`, \`selector\` or \`text\`. Use it after ${n.showStep} to pause while the user does the step themselves. ` +
        "It returns the kind of interaction and the element, never field values. " +
        "A `timeout` or `superseded` status is not a failure: the user has not acted, and the highlight stays, so call again or ask them. " +
        "If this call fails, never returns, or returns after the page has changed, check the page: the user most likely clicked the control.",
      inputSchema: {
        type: "object",
        properties: {
          target: str("At most one of target, selector, text. None means the highlighted element."),
          selector: str(),
          text: str(),
          index: { type: "integer", minimum: 0, description: "Pick among listed candidates (0-based)." },
          events: { type: "array", items: { type: "string", enum: ["click", "change"] }, description: "Default: click for buttons and links, change for fields." },
        },
      },
      annotations: ro,
      execute: safe((input, options) => tour.waitForInteraction(input as WaitInput, options)),
    },
  ];
}
