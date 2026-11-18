// Public API. Must stay side-effect free (SSR-safe): no DOM access at import time.
export { VERSION } from "./engine/index.js";

// Resolver (M1).
export { resolve } from "./engine/resolver/index.js";
export type { ResolveInput, ResolveResult, ResolverOptions } from "./engine/resolver/index.js";
