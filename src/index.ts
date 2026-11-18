// Public API. Must stay side-effect free (SSR-safe): no DOM access at import time.
export { VERSION } from "./engine/index.js";

// Resolver (M1).
export { resolve } from "./engine/resolver/index.js";
export type { ResolveInput, ResolveResult, ResolverOptions } from "./engine/resolver/index.js";

// Tour API (M1).
export { createTour, MAX_MESSAGE, MAX_TITLE } from "./tour/index.js";
export type { DismissResult, StepInput, StepResult, TargetDefinition, Tour, TourEvents, TourOptions } from "./tour/index.js";

// Overlay.
export { Overlay } from "./engine/index.js";
export type { OverlayOptions, OverlayStep, ShowResult } from "./engine/index.js";

// Tools layer (M2).
export { getModelContext } from "./adapters/index.js";
export type { ModelContextLike, RegistrableTool } from "./adapters/index.js";
export { DEFAULT_NAMES, defineTools, registerAutoTools } from "./tools/index.js";
export type { AutoHandle, AutoOptions, ToolDefinition, ToolNames, ToolResult } from "./tools/index.js";
export type { TargetInfo } from "./engine/resolver/index.js";
