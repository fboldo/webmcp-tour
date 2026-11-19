// The tour for this app: the pages it has and how to move between them, registered as WebMCP tools.
import { createTour, registerAsWebMcpTool } from "/dist/index.js";
import { navigate, PAGES } from "./app.js";

export const tour = createTour({ pages: PAGES, navigate });
window.webmcpTour = tour;
await registerAsWebMcpTool(tour);
