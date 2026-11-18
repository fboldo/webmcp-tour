// Side-effect entry: `import "webmcp-tour/auto"` registers the toolset.
// The `typeof document` guard keeps SSR imports safe; the singleton in
// registerAutoTools() keeps a script tag plus this import to one registration.
import { registerAutoTools } from "./tools/index.js";

if (typeof document !== "undefined") registerAutoTools();
