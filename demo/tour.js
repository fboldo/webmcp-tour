// The tour for this app: the pages it has and how to move between them. This module must
// run before /dist/auto.js (demo.js imports them in that order), because the first
// createTour() call decides the options; auto.js then registers tools on this same tour.
import { createTour } from "/dist/index.js";
import { navigate, PAGES } from "./app.js";

export const tour = createTour({ pages: PAGES, navigate });
window.webmcpTour = tour;
