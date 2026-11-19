// Without a document (server render) the read-only helpers answer empty instead of throwing.
import { expect, it } from "vitest";
import SsrWorker from "./ssr-worker.ts?worker";

it("defineTarget, targets() and outline() do not throw without a document", async () => {
  const worker = new SsrWorker();
  const out = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message));
  });
  worker.terminate();
  expect(out).toEqual({ ok: true, hasDocument: false, targets: [], outline: { headings: [], controls: [] } });
});
