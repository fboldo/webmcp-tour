// Run: node --test skills/webmcp-tour/scripts/audit.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { auditSource } from "./audit.mjs";

const run = (s) => auditSource(s, "t.html");

test("flags a bare button and suggests an id from its text", () => {
  const [f] = run(`<main>\n<button class="x">Change plan</button></main>`);
  assert.equal(f.line, 2);
  assert.equal(f.name, "Change plan");
  assert.deepEqual(f.missing, ["data-tour-id", "data-tour-description"]);
  assert.match(f.suggestion, /data-tour-id="change-plan"/);
});

test("complete, excluded and hidden controls are skipped", () => {
  assert.deepEqual(run(`<button data-tour-id="a" data-tour-description="d">A</button>`), []);
  assert.deepEqual(run(`<button data-tour-exclude>Delete</button>`), []);
  assert.deepEqual(run(`<input type="hidden" name="csrf">`), []);
  assert.deepEqual(run(`<a name="top">anchor</a>`), []);
});

test("id without description asks only for the description", () => {
  const [f] = run(`<button data-tour-id="a">A</button>`);
  assert.deepEqual(f.missing, ["data-tour-description"]);
});

test("JSX: > inside braces does not end the tag; role=button counts", () => {
  const f = run(`<div role="button" onClick={() => go(a > b)}>Open</div>\n<Button>x</Button>`);
  assert.equal(f.length, 1);
  assert.equal(f[0].name, "Open");
});

test("links need href; aria-label names icon buttons", () => {
  const f = run(`<a href="/billing">Billing</a><button aria-label="Close"><svg/></button>`);
  assert.deepEqual(f.map((x) => x.name), ["Billing", "Close"]);
});
