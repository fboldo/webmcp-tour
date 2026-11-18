// Side-effect entry: `import "webmcp-tour/auto"` registers the toolset.
// Registration lands in M2; the `typeof document` guard keeps SSR imports safe.
if (typeof document !== "undefined") {
  // registerAutoTools() — M2
}

export {};
