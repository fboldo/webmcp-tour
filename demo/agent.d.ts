export interface ToolEntry {
  name: string;
  description: string;
  inputSchema?: object;
}
export interface ModelContextLike {
  getTools(): Promise<ToolEntry[]>;
  executeTool(tool: ToolEntry, input?: object, options?: { signal?: AbortSignal }): Promise<unknown>;
}
export type AgentEvent =
  | { type: "user" | "answer" | "error" | "status"; text: string }
  | { type: "call"; tool: string; args: Record<string, unknown> }
  | { type: "result"; tool: string; result: Record<string, unknown> };
export type Mode = "auto" | "native" | "constraint" | "openrouter" | "scripted";
export const FINAL: string;
export const MAX_STEPS: number;
export function detectModel(LanguageModel: unknown): Promise<string>;
export function listTools(modelContext: ModelContextLike, options?: { tries?: number; delay?: number }): Promise<ToolEntry[]>;
export function callTool(modelContext: ModelContextLike, tool: ToolEntry | undefined, args?: object, signal?: AbortSignal): Promise<Record<string, unknown>>;
export function responseSchema(names: string[]): object;
export function systemPrompt(tools: ToolEntry[]): string;
export function ask(options: {
  question: string;
  mode?: Mode;
  LanguageModel?: unknown;
  modelContext: ModelContextLike;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  openrouter?: { apiKey?: string; model?: string };
  fetch?: typeof fetch;
}): Promise<{ answer: string; mode: string }>;
