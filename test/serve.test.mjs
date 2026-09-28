import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveRuns } from "../src/serve.mjs";

const sampleReport = {
  pack: { name: "demo", version: "v1", title: "Demo pack" },
  meta: { model: "test-model", baseUrl: "http://x/v1", startedAt: "2026-09-28T00:00:00Z", hardware: "rig", settings: { temperature: 0, maxTokens: 64, timeoutMs: 1000 }, performance: { calls: 1, medianLatencyMs: 5, minLatencyMs: 5, maxLatencyMs: 5, medianTokensPerSecond: 10, totalCompletionTokens: 20, medianCompletionTokens: 20, medianPromptTokens: 10, metered: true } },
  summary: { total: 2, passed: 1, failed: 1, passRate: 0.5, byCheck: [{ kind: "regex", total: 2, passed: 1 }], byTag: [{ tag: "guardrail", total: 2, passed: 1 }], failures: [] },
  items: [{ id: "a", tags: ["guardrail"], passed: true, checks: [{ kind: "regex", passed: true, detail: "matched" }], output: "ok" }],
  caveats: ["One run per item."],
};

test("the viewer lists runs and renders a run page", async () => {
  const dir = mkdtempSync(join(tmpdir(), "evalkit-view-"));
  writeFileSync(join(dir, "demo.json"), JSON.stringify(sampleReport));
  const server = serveRuns({ runsDir: dir, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const index = await (await fetch(base)).text();
    assert.match(index, /evalkit runs/);
    assert.match(index, /Demo pack/);
    const api = await (await fetch(`${base}/api/runs`)).json();
    assert.equal(api.length, 1);
    assert.equal(api[0].summary.passed, 1);
    const page = await (await fetch(`${base}/run/demo.json`)).text();
    assert.match(page, /1\/2 passed/);
    assert.match(page, /guardrail/);
    const bad = await fetch(`${base}/run/..%2Fetc%2Fpasswd`);
    assert.equal(bad.status, 400);
    const missing = await fetch(`${base}/run/none.json`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
