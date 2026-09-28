import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPack } from "../src/pack.mjs";
import { runPack } from "../src/run.mjs";
import { toMarkdown } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = loadPack(resolve(here, "..", "packs", "receptionist-v1")).pack;

const options = { baseUrl: "http://localhost:9/v1", model: "fake", apiKey: "x", maxTokens: 64, temperature: 0, timeoutMs: 1000, hardware: "test rig" };

/** A fake endpoint that answers per item id, so the run is deterministic. */
function fakeFetch(answerFor) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const user = body.messages.at(-1).content;
    const id = user.split("\n").slice(-1)[0] ?? user;
    const content = answerFor(user, id);
    return { ok: true, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  };
}

test("runPack scores every item and records a failed call as a failed item", async () => {
  const report = await runPack(pack, options, fakeFetch(() => "I will call you back after checking availability."));
  assert.equal(report.summary.total, 8);
  assert.equal(report.items.length, 8);
  assert.equal(report.meta.errors.length, 0);
  assert.ok(report.meta.performance.medianLatencyMs >= 0);
  assert.equal(report.meta.settings.temperature, 0);
  assert.equal(report.meta.performance.calls, 8);
});

test("runPack marks an HTTP error as a failed call, never a skip", async () => {
  const failing = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const report = await runPack(pack, options, failing);
  assert.equal(report.summary.passed, 0);
  assert.equal(report.meta.errors.length, 8);
  assert.equal(report.items.every((item) => item.checks[0].kind === "call"), true);
});

test("the Markdown report carries the caveats and the failures", async () => {
  const report = await runPack(pack, options, fakeFetch(() => "Sorry, I cannot share that. I will ask a colleague to call you back."));
  const markdown = toMarkdown(report);
  assert.match(markdown, /## Caveats/);
  assert.match(markdown, /One run per item/);
  assert.match(markdown, /## Failures/);
});

test("the report records the settings and the performance block", async () => {
  const report = await runPack(pack, { ...options, quant: "Q4_K_M", context: "32768", kv: "q8_0", command: "evalkit run packs/receptionist-v1 --model fake" }, fakeFetch(() => "I will call you back after checking availability."));
  assert.equal(report.meta.settings.temperature, 0);
  assert.equal(report.meta.settings.maxTokens, 64);
  assert.equal(report.meta.settings.timeoutMs, 1000);
  assert.equal(report.meta.settings.quant, "Q4_K_M");
  assert.equal(report.meta.settings.context, "32768");
  assert.equal(report.meta.settings.kv, "q8_0");
  assert.equal(report.meta.command, "evalkit run packs/receptionist-v1 --model fake");
  assert.equal(report.meta.performance.calls, 8);
  assert.ok(report.meta.performance.medianLatencyMs >= 0);
  assert.ok(report.meta.performance.medianTokensPerSecond > 0);
  const markdown = toMarkdown(report);
  assert.match(markdown, /## Performance/);
  assert.match(markdown, /Declared quant:/);
  assert.match(markdown, /evalkit run packs\/receptionist-v1/);
});
