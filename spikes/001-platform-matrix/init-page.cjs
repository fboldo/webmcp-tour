// Playwright MCP --init-page hook: raise the page default timeout (30 s) that caps WebMCP tool calls.
module.exports = { default: async ({ page }) => page.setDefaultTimeout(300000) };
