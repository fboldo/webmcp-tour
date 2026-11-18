import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("smoke", () => {
  it("runs in a real browser with layout", () => {
    expect(typeof window).toBe("object");
    expect(navigator.userAgent).toMatch(/Chrome/);

    const button = document.createElement("button");
    button.textContent = "Change plan";
    document.body.append(button);

    // happy-dom/jsdom have no layout: these only pass in a real engine.
    const rect = button.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(button.checkVisibility()).toBe(true);
    expect(button.innerText).toBe("Change plan");

    button.remove();
  });

  it("imports the public entry", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
