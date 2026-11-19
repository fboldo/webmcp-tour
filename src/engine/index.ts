// L1 engine: resolver · highlight · popover · theme · wait · envelopes.
// Framework-agnostic, zero deps, no DOM access at import time.

declare const __VERSION__: string;
/** Library version, taken from package.json at build time. */
export const VERSION: string = __VERSION__;

export { Overlay } from "./overlay/index.js";
export type { Labels, OverlayOptions, OverlayStep, ShowResult } from "./overlay/index.js";
